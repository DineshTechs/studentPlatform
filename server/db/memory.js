// In-memory implementation of the subset of the MongoDB Node driver API this app uses.
// Purpose: run the full test suite and an offline demo without a MongoDB server.
// Semantics follow MongoDB for the operators implemented; anything unsupported throws loudly
// so code never silently relies on behaviour the real driver would treat differently.

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

class DuplicateKeyError extends Error {
  constructor(index, key) {
    super(`E11000 duplicate key error collection index: ${index} dup key: ${JSON.stringify(key)}`);
    this.code = 11000;
    this.keyValue = key;
  }
}

function getPath(doc, path) {
  const parts = path.split('.');
  let cur = [doc];
  for (const p of parts) {
    const next = [];
    for (const c of cur) {
      if (c == null) continue;
      if (Array.isArray(c) && !/^\d+$/.test(p)) {
        for (const el of c) if (el != null && typeof el === 'object') next.push(el[p]);
      } else next.push(c[p]);
    }
    cur = next;
  }
  return cur; // list of candidate values (array traversal)
}

function cmp(a, b) {
  if (a instanceof Date) a = a.valueOf();
  if (b instanceof Date) b = b.valueOf();
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a !== typeof b) return String(typeof a) < String(typeof b) ? -1 : 1;
  return a < b ? -1 : 1;
}

function eq(a, b) {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.valueOf() === b.valueOf();
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  if ((a === undefined || a === null) && (b === undefined || b === null)) return true;
  return a === b;
}

function expand(values) {
  // a field matches if the value or any element of an array value matches
  const out = [];
  for (const v of values) { out.push(v); if (Array.isArray(v)) out.push(...v); }
  return out;
}

function matchOps(values, cond) {
  const isOpObj = cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && !(cond instanceof RegExp)
    && Object.keys(cond).length > 0 && Object.keys(cond).every((k) => k.startsWith('$'));
  if (cond instanceof RegExp) return expand(values).some((v) => typeof v === 'string' && cond.test(v));
  if (!isOpObj) {
    if (cond === null) return values.length === 0 || values.some((v) => v === null || v === undefined);
    return expand(values).some((v) => eq(v, cond));
  }
  for (const [op, arg] of Object.entries(cond)) {
    const all = expand(values);
    const present = values.filter((v) => v !== undefined);
    let ok;
    switch (op) {
      case '$eq': ok = matchOps(values, arg); break;
      case '$ne': ok = !matchOps(values, arg); break;
      case '$in': ok = arg.some((a) => (a instanceof RegExp ? all.some((v) => typeof v === 'string' && a.test(v)) : all.some((v) => eq(v, a)) || (a === null && present.length === 0))); break;
      case '$nin': ok = !arg.some((a) => all.some((v) => eq(v, a)) || (a === null && present.length === 0)); break;
      case '$gt': ok = all.some((v) => v !== undefined && v !== null && cmp(v, arg) > 0); break;
      case '$gte': ok = all.some((v) => v !== undefined && v !== null && cmp(v, arg) >= 0); break;
      case '$lt': ok = all.some((v) => v !== undefined && v !== null && cmp(v, arg) < 0); break;
      case '$lte': ok = all.some((v) => v !== undefined && v !== null && cmp(v, arg) <= 0); break;
      case '$exists': ok = arg ? present.length > 0 : present.length === 0; break;
      case '$regex': {
        const re = arg instanceof RegExp ? arg : new RegExp(arg, cond.$options || '');
        ok = all.some((v) => typeof v === 'string' && re.test(v));
        break;
      }
      case '$options': ok = true; break;
      case '$all': ok = arg.every((a) => all.some((v) => eq(v, a))); break;
      case '$size': ok = present.some((v) => Array.isArray(v) && v.length === arg); break;
      case '$elemMatch': ok = present.some((v) => Array.isArray(v) && v.some((el) => matches(el, arg))); break;
      case '$not': ok = !matchOps(values, arg); break;
      default: throw new Error(`memory-db: unsupported query operator ${op}`);
    }
    if (!ok) return false;
  }
  return true;
}

export function matches(doc, filter = {}) {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$and') { if (!cond.every((f) => matches(doc, f))) return false; continue; }
    if (key === '$or') { if (!cond.some((f) => matches(doc, f))) return false; continue; }
    if (key === '$nor') { if (cond.some((f) => matches(doc, f))) return false; continue; }
    if (key.startsWith('$')) throw new Error(`memory-db: unsupported top-level operator ${key}`);
    if (!matchOps(getPath(doc, key), cond)) return false;
  }
  return true;
}

function setPath(doc, path, value) {
  const parts = path.split('.');
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts.at(-1)] = value;
}
function unsetPath(doc, path) {
  const parts = path.split('.');
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i++) { cur = cur?.[parts[i]]; if (cur == null) return; }
  delete cur[parts.at(-1)];
}
function readPath(doc, path) {
  return path.split('.').reduce((c, p) => (c == null ? undefined : c[p]), doc);
}

function applyUpdate(doc, update, isInsert) {
  const keys = Object.keys(update);
  if (!keys.length || !keys.every((k) => k.startsWith('$'))) throw new Error('memory-db: update must use operators');
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, val] of Object.entries(fields)) {
      switch (op) {
        case '$set': setPath(doc, path, clone(val)); break;
        case '$setOnInsert': if (isInsert) setPath(doc, path, clone(val)); break;
        case '$unset': unsetPath(doc, path); break;
        case '$inc': setPath(doc, path, (readPath(doc, path) || 0) + val); break;
        case '$min': { const c = readPath(doc, path); if (c === undefined || cmp(val, c) < 0) setPath(doc, path, clone(val)); break; }
        case '$max': { const c = readPath(doc, path); if (c === undefined || cmp(val, c) > 0) setPath(doc, path, clone(val)); break; }
        case '$push': {
          let arr = readPath(doc, path);
          if (arr === undefined) { arr = []; setPath(doc, path, arr); }
          if (!Array.isArray(arr)) throw new Error('memory-db: $push on non-array');
          if (val && typeof val === 'object' && '$each' in val) {
            arr.push(...clone(val.$each));
            if (val.$slice !== undefined) {
              const s = val.$slice;
              const kept = s < 0 ? arr.slice(s) : arr.slice(0, s);
              arr.length = 0; arr.push(...kept);
            }
          } else arr.push(clone(val));
          break;
        }
        case '$addToSet': {
          let arr = readPath(doc, path);
          if (arr === undefined) { arr = []; setPath(doc, path, arr); }
          const items = val && typeof val === 'object' && '$each' in val ? val.$each : [val];
          for (const it of items) if (!arr.some((x) => eq(x, it))) arr.push(clone(it));
          break;
        }
        case '$pull': {
          const arr = readPath(doc, path);
          if (!Array.isArray(arr)) break;
          const keep = arr.filter((x) => (val && typeof val === 'object' && !Array.isArray(val) ? !(typeof x === 'object' ? matches(x, val) : matchOps([x], val)) : !eq(x, val)));
          setPath(doc, path, keep);
          break;
        }
        default: throw new Error(`memory-db: unsupported update operator ${op}`);
      }
    }
  }
}

function project(doc, projection) {
  if (!projection || !Object.keys(projection).length) return clone(doc);
  const entries = Object.entries(projection);
  const inclusive = entries.some(([k, v]) => v && k !== '_id');
  if (inclusive) {
    const out = {};
    if (projection._id !== 0) out._id = clone(doc._id);
    for (const [k, v] of entries) if (v && k !== '_id') { const val = readPath(doc, k); if (val !== undefined) setPath(out, k, clone(val)); }
    return out;
  }
  const out = clone(doc);
  for (const [k, v] of entries) if (!v) unsetPath(out, k);
  return out;
}

function sortDocs(docs, sort) {
  const entries = Object.entries(sort || {});
  if (!entries.length) return docs;
  return docs.sort((a, b) => {
    for (const [k, dir] of entries) {
      const c = cmp(readPath(a, k), readPath(b, k));
      if (c) return dir < 0 ? -c : c;
    }
    return 0;
  });
}

class Cursor {
  constructor(coll, filter, options = {}) {
    this.coll = coll; this.filter = filter;
    this._sort = options.sort; this._limit = options.limit; this._skip = options.skip; this._proj = options.projection;
  }
  sort(s) { this._sort = s; return this; }
  limit(n) { this._limit = n; return this; }
  skip(n) { this._skip = n; return this; }
  project(p) { this._proj = p; return this; }
  async toArray() {
    let docs = [...this.coll.docs.values()].filter((d) => matches(d, this.filter));
    docs = sortDocs(docs, this._sort);
    if (this._skip) docs = docs.slice(this._skip);
    if (this._limit) docs = docs.slice(0, this._limit);
    return docs.map((d) => project(d, this._proj));
  }
}

class Collection {
  constructor(name) { this.collectionName = name; this.docs = new Map(); this.uniqueIndexes = []; }

  checkUnique(doc, ignoreId) {
    for (const idx of this.uniqueIndexes) {
      const key = {};
      let partialOk = !idx.partialFilterExpression || matches(doc, idx.partialFilterExpression);
      if (!partialOk) continue;
      for (const f of idx.fields) key[f] = readPath(doc, f);
      if (idx.sparse && Object.values(key).every((v) => v === undefined)) continue;
      for (const other of this.docs.values()) {
        if (other._id === ignoreId) continue;
        if (idx.partialFilterExpression && !matches(other, idx.partialFilterExpression)) continue;
        if (idx.fields.every((f) => eq(readPath(other, f), key[f]))) throw new DuplicateKeyError(idx.name, key);
      }
    }
  }

  async createIndex(keys, opts = {}) {
    const fields = Object.keys(keys);
    const name = opts.name || fields.map((f) => `${f}_${keys[f]}`).join('_');
    if (opts.unique && !this.uniqueIndexes.some((i) => i.name === name)) {
      this.uniqueIndexes.push({ name, fields, sparse: opts.sparse, partialFilterExpression: opts.partialFilterExpression });
    }
    return name;
  }

  async insertOne(doc) {
    const d = clone(doc);
    if (d._id === undefined) throw new Error('memory-db: documents must carry an explicit _id');
    if (this.docs.has(d._id)) throw new DuplicateKeyError('_id_', { _id: d._id });
    this.checkUnique(d);
    this.docs.set(d._id, d);
    return { acknowledged: true, insertedId: d._id };
  }

  async insertMany(docs) {
    for (const d of docs) await this.insertOne(d);
    return { acknowledged: true, insertedCount: docs.length };
  }

  async findOne(filter = {}, options = {}) {
    const [doc] = await new Cursor(this, filter, { ...options, limit: 1 }).toArray();
    return doc ?? null;
  }

  find(filter = {}, options = {}) { return new Cursor(this, filter, options); }

  async countDocuments(filter = {}) {
    let n = 0;
    for (const d of this.docs.values()) if (matches(d, filter)) n++;
    return n;
  }

  async distinct(field, filter = {}) {
    const out = [];
    for (const d of this.docs.values()) {
      if (!matches(d, filter)) continue;
      for (const v of expand(getPath(d, field))) if (v !== undefined && !Array.isArray(v) && !out.some((x) => eq(x, v))) out.push(v);
    }
    return out;
  }

  _upsertDoc(filter, update) {
    const base = {};
    for (const [k, v] of Object.entries(filter)) {
      if (!k.startsWith('$') && (v === null || typeof v !== 'object' || v instanceof Date || Array.isArray(v))) setPath(base, k, clone(v));
    }
    applyUpdate(base, update, true);
    if (base._id === undefined) throw new Error('memory-db: upsert requires _id in filter or $setOnInsert');
    return base;
  }

  _updateDoc(existing, update) {
    const next = clone(existing);
    applyUpdate(next, update, false);
    if (next._id !== existing._id) throw new Error('memory-db: _id is immutable');
    this.checkUnique(next, existing._id);
    this.docs.set(next._id, next);
    return next;
  }

  async updateOne(filter, update, opts = {}) {
    for (const d of this.docs.values()) {
      if (matches(d, filter)) {
        const before = JSON.stringify(d);
        const after = this._updateDoc(d, update);
        return { acknowledged: true, matchedCount: 1, modifiedCount: before === JSON.stringify(after) ? 0 : 1, upsertedId: null };
      }
    }
    if (opts.upsert) {
      const doc = this._upsertDoc(filter, update);
      await this.insertOne(doc);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: doc._id, upsertedCount: 1 };
    }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null };
  }

  async updateMany(filter, update) {
    let n = 0;
    for (const d of [...this.docs.values()]) if (matches(d, filter)) { this._updateDoc(d, update); n++; }
    return { acknowledged: true, matchedCount: n, modifiedCount: n };
  }

  async findOneAndUpdate(filter, update, opts = {}) {
    const candidates = sortDocs([...this.docs.values()].filter((d) => matches(d, filter)), opts.sort);
    const d = candidates[0];
    if (d) {
      const before = clone(d);
      const after = this._updateDoc(d, update);
      return project(opts.returnDocument === 'after' ? after : before, opts.projection);
    }
    if (opts.upsert) {
      const doc = this._upsertDoc(filter, update);
      await this.insertOne(doc);
      return opts.returnDocument === 'after' ? project(doc, opts.projection) : null;
    }
    return null;
  }

  async deleteOne(filter) {
    for (const d of this.docs.values()) if (matches(d, filter)) { this.docs.delete(d._id); return { acknowledged: true, deletedCount: 1 }; }
    return { acknowledged: true, deletedCount: 0 };
  }

  async deleteMany(filter = {}) {
    let n = 0;
    for (const d of [...this.docs.values()]) if (matches(d, filter)) { this.docs.delete(d._id); n++; }
    return { acknowledged: true, deletedCount: n };
  }
}

export function createMemoryDb() {
  const collections = new Map();
  return {
    kind: 'memory',
    collection(name) {
      if (!collections.has(name)) collections.set(name, new Collection(name));
      return collections.get(name);
    },
    async dropDatabase() { collections.clear(); },
    async close() {},
  };
}
