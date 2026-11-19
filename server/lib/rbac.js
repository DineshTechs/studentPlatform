// Role → permission map. Every protected route declares the permission it needs and the
// router enforces it server-side; the UI only uses this list to decide what to show.
export const ROLES = ['student', 'admin', 'editor', 'reviewer', 'mentor'];

export const PERMISSIONS = {
  student: [
    'exam.read', 'syllabus.read', 'test.take', 'practice', 'bookmark', 'profile.self',
  ],
  editor: [
    'exam.read', 'syllabus.read', 'syllabus.manage', 'question.create', 'question.edit_own', 'question.read_all',
    'question.import', 'profile.self',
  ],
  reviewer: [
    'exam.read', 'syllabus.read', 'question.read_all', 'question.review', 'profile.self',
  ],
  mentor: [
    'exam.read', 'syllabus.read', 'question.read_all', 'evaluation.descriptive', 'student.performance.read', 'profile.self',
    'test.take', 'practice',
  ],
  admin: ['*'],
};

export function can(user, permission) {
  if (!user) return false;
  const perms = PERMISSIONS[user.role] || [];
  return perms.includes('*') || perms.includes(permission);
}

export function permissionsFor(role) {
  const perms = PERMISSIONS[role] || [];
  if (perms.includes('*')) return ['*'];
  return perms;
}
