// Original sample questions written for this platform (not previous-year questions).
// Topic references are "subject/chapter/topic" syllabus keys.

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const opts = (list) => list.map((text, i) => ({ key: KEYS[i], text }));

function mcq(topic, difficulty, stem, options, correct, explanation, hi) {
  const q = { topic, type: 'mcq_single', difficulty, content: { en: { stem, options: opts(options), explanation } }, answer: { correct } };
  if (hi) q.content.hi = { stem: hi.stem, options: opts(hi.options), explanation: hi.explanation || '' };
  return q;
}
function multi(topic, difficulty, stem, options, correct, explanation) {
  return { topic, type: 'mcq_multi', difficulty, content: { en: { stem, options: opts(options), explanation } }, answer: { correct } };
}
function numeric(topic, difficulty, stem, value, explanation, tolerance = 0) {
  return { topic, type: 'numeric', difficulty, content: { en: { stem, explanation } }, answer: { value, tolerance } };
}
function descriptive(topic, difficulty, stem, maxMarks, wordLimit, modelAnswer) {
  return { topic, type: 'descriptive', difficulty, content: { en: { stem, explanation: modelAnswer } }, answer: { maxMarks, wordLimit, modelAnswer } };
}

export const QUESTIONS = [
  // ---------------- Physics
  mcq('physics/kinematics/motion-1d', 'easy', 'A body starts from rest and moves with a uniform acceleration of $2\\,\\text{m/s}^2$. How far does it travel in the first 5 s?', ['10 m', '25 m', '50 m', '12.5 m'], 'B', 'Using $s = ut + \\tfrac12 at^2 = 0 + \\tfrac12 (2)(5^2) = 25$ m.'),
  mcq('physics/kinematics/motion-1d', 'medium', 'A ball is thrown vertically upward with a speed of 20 m/s. Taking $g = 10\\,\\text{m/s}^2$, what is the maximum height reached?', ['10 m', '40 m', '20 m', '30 m'], 'C', 'At the top $v = 0$: $h = u^2/2g = 400/20 = 20$ m.'),
  mcq('physics/kinematics/projectile', 'medium', 'A projectile is launched at 45° with a speed of 20 m/s on level ground ($g = 10\\,\\text{m/s}^2$). What is its horizontal range?', ['40 m', '20 m', '80 m', '10 m'], 'A', '$R = u^2 \\sin 2\\theta / g = 400 \\times 1 / 10 = 40$ m.'),
  mcq('physics/kinematics/projectile', 'easy', 'At the highest point of a projectile\'s path (no air resistance), which quantity is zero?', ['Horizontal component of velocity', 'Acceleration', 'Vertical component of velocity', 'Kinetic energy'], 'C', 'Only the vertical velocity becomes zero; the horizontal velocity and the acceleration $g$ remain.'),
  mcq('physics/laws-of-motion/newton-laws', 'easy', 'A force of 20 N acts on a 5 kg block resting on a frictionless surface. What is the acceleration of the block?', ['2 m/s²', '100 m/s²', '0.25 m/s²', '4 m/s²'], 'D', '$a = F/m = 20/5 = 4\\,\\text{m/s}^2$.'),
  mcq('physics/laws-of-motion/friction', 'medium', 'A 2 kg block rests on a horizontal floor. The coefficient of static friction is 0.5 ($g = 10\\,\\text{m/s}^2$). What minimum horizontal force will just start it moving?', ['5 N', '10 N', '20 N', '1 N'], 'B', '$f_{max} = \\mu_s mg = 0.5 \\times 2 \\times 10 = 10$ N.'),
  mcq('physics/electrostatics/coulomb', 'easy', 'The distance between two point charges is doubled. The electrostatic force between them becomes:', ['double', 'half', 'one-fourth', 'four times'], 'C', 'Coulomb force varies as $1/r^2$; doubling $r$ makes it $1/4$.'),
  mcq('physics/electrostatics/potential', 'easy', 'How much work is done in moving a charge between two points on the same equipotential surface?', ['Zero', 'Positive', 'Negative', 'Depends on the path'], 'A', '$W = q\\Delta V$ and $\\Delta V = 0$ on an equipotential surface.'),
  mcq('physics/laws-of-motion/newton-laws', 'medium', 'A book rests on a table. Which pair of forces forms an action–reaction pair?', ['Weight of the book and normal force on the book', 'Force of the book on the table and force of the table on the book', 'Weight of the book and weight of the table', 'Normal force on the book and friction on the book'], 'B', 'Action–reaction forces act on different bodies. The book pushes the table and the table pushes the book.'),
  numeric('physics/kinematics/motion-1d', 'easy', 'A car speeds up uniformly from 10 m/s to 30 m/s in 5 s. What is its acceleration in m/s²?', 4, '$a = (30 - 10)/5 = 4\\,\\text{m/s}^2$.'),
  numeric('physics/electrostatics/potential', 'medium', 'Find the electric potential (in volts) at a distance of 0.3 m from a point charge of 2 nC. Take $k = 9 \\times 10^9\\,\\text{N m}^2/\\text{C}^2$.', 60, '$V = kq/r = 9\\times10^9 \\times 2\\times10^{-9} / 0.3 = 60$ V.'),
  numeric('physics/kinematics/projectile', 'medium', 'A projectile is launched at 30° above the horizontal with a speed of 30 m/s ($g = 10\\,\\text{m/s}^2$). What is its time of flight in seconds?', 3, '$T = 2u\\sin\\theta / g = 2 \\times 30 \\times 0.5 / 10 = 3$ s.'),
  multi('physics/kinematics/projectile', 'medium', 'For a projectile launched from level ground with no air resistance, which of the following statements are correct?', ['The horizontal component of velocity stays constant', 'The acceleration is $g$, directed downward, throughout the flight', 'The speed is minimum at the highest point', 'The range is maximum when the angle of projection is 60°'], ['A', 'B', 'C'], 'Gravity has no horizontal component, so (A) and (B) hold. Speed is least at the top where only the horizontal component remains (C). The range is maximum at 45°, not 60°.'),

  // ---------------- Chemistry
  mcq('chemistry/mole-concept/stoichiometry', 'easy', 'How many moles of water are present in 36 g of water? (Molar mass of H₂O = 18 g/mol)', ['1', '2', '3', '0.5'], 'B', 'Moles = 36/18 = 2.'),
  mcq('chemistry/mole-concept/stoichiometry', 'medium', 'How many molecules are present in 0.5 mol of CO₂? ($N_A = 6.022\\times10^{23}$)', ['$6.022\\times10^{23}$', '$3.011\\times10^{23}$', '$1.204\\times10^{24}$', '$1.5\\times10^{23}$'], 'B', 'Molecules = $0.5 \\times 6.022\\times10^{23} = 3.011\\times10^{23}$.'),
  mcq('chemistry/atomic-structure/quantum-numbers', 'easy', 'What is the maximum number of electrons in a subshell with $l = 2$?', ['2', '6', '10', '14'], 'C', 'The subshell has $2l + 1 = 5$ orbitals, each holding 2 electrons: 10.'),
  mcq('chemistry/atomic-structure/quantum-numbers', 'medium', 'How many orbitals are possible for the shell with principal quantum number $n = 3$?', ['9', '3', '18', '6'], 'A', 'The number of orbitals in a shell is $n^2 = 9$.'),
  mcq('chemistry/bonding/hybridisation', 'easy', 'What is the hybridisation of carbon in methane (CH₄)?', ['sp³', 'sp', 'sp²', 'dsp²'], 'A', 'Four bond pairs and no lone pairs around carbon give sp³ hybridisation.'),
  mcq('chemistry/bonding/hybridisation', 'medium', 'What is the shape of the ammonia (NH₃) molecule?', ['Trigonal planar', 'Trigonal pyramidal', 'Tetrahedral', 'T-shaped'], 'B', 'Three bond pairs and one lone pair: the electron geometry is tetrahedral and the molecular shape is trigonal pyramidal.'),
  mcq('chemistry/periodic/periodic-trends', 'easy', 'Moving from left to right across a period, the atomic radius generally:', ['increases', 'decreases', 'stays the same', 'first increases then decreases'], 'B', 'Nuclear charge increases while electrons enter the same shell, pulling them closer.'),
  mcq('chemistry/periodic/periodic-trends', 'easy', 'Which element has the highest electronegativity?', ['Oxygen', 'Chlorine', 'Fluorine', 'Nitrogen'], 'C', 'Fluorine is the most electronegative element (3.98 on the Pauling scale).'),
  mcq('chemistry/bonding/hybridisation', 'medium', 'The H–O–H bond angle in a water molecule is approximately:', ['180°', '109.5°', '120°', '104.5°'], 'D', 'Two lone pairs on oxygen compress the tetrahedral angle to about 104.5°.'),
  numeric('chemistry/mole-concept/stoichiometry', 'easy', 'What is the mass in grams of 0.25 mol of NaOH? (Molar mass = 40 g/mol)', 10, 'Mass = 0.25 × 40 = 10 g.'),
  numeric('chemistry/mole-concept/stoichiometry', 'easy', 'What volume in litres does 2 mol of an ideal gas occupy at STP? (Take 22.4 L/mol)', 44.8, 'Volume = 2 × 22.4 = 44.8 L.', 0.1),
  numeric('chemistry/mole-concept/stoichiometry', 'medium', 'How many moles of O₂ are required to burn 1 mol of CH₄ completely?', 2, 'CH₄ + 2O₂ → CO₂ + 2H₂O, so 2 mol of O₂.'),

  // ---------------- Mathematics
  mcq('mathematics/algebra/quadratic', 'easy', 'What is the sum of the roots of $2x^2 - 8x + 3 = 0$?', ['4', '−4', '3/2', '8'], 'A', 'Sum of roots $= -b/a = 8/2 = 4$.'),
  mcq('mathematics/algebra/quadratic', 'easy', 'What is the product of the roots of $x^2 + 5x + 6 = 0$?', ['−6', '5', '6', '−5'], 'C', 'Product of roots $= c/a = 6$.'),
  mcq('mathematics/algebra/sequences', 'easy', 'What is the 10th term of the arithmetic progression 3, 7, 11, …?', ['43', '39', '40', '36'], 'B', '$a_{10} = 3 + 9 \\times 4 = 39$.'),
  mcq('mathematics/algebra/sequences', 'easy', 'What is the sum of the first 20 natural numbers?', ['190', '200', '220', '210'], 'D', '$n(n+1)/2 = 20 \\times 21 / 2 = 210$.'),
  mcq('mathematics/calculus/limits', 'medium', 'Evaluate $\\lim_{x \\to 0} \\dfrac{\\sin 3x}{x}$.', ['0', '1', '3', '1/3'], 'C', '$\\dfrac{\\sin 3x}{x} = 3 \\cdot \\dfrac{\\sin 3x}{3x} \\to 3$.'),
  mcq('mathematics/calculus/derivatives', 'easy', 'What is the derivative of $x^3$ at $x = 2$?', ['8', '12', '6', '4'], 'B', '$\\frac{d}{dx}x^3 = 3x^2 = 12$ at $x = 2$.'),
  mcq('mathematics/coordinate/straight-lines', 'easy', 'What is the slope of the line $3x + 4y - 7 = 0$?', ['3/4', '−4/3', '−3/4', '4/3'], 'C', 'Slope $= -a/b = -3/4$.'),
  mcq('mathematics/coordinate/straight-lines', 'easy', 'What is the distance between the points (1, 2) and (4, 6)?', ['5', '7', '√7', '25'], 'A', '$\\sqrt{3^2 + 4^2} = 5$.'),
  mcq('mathematics/coordinate/straight-lines', 'medium', 'The lines $y = 2x + 1$ and $y = 2x - 5$ are:', ['perpendicular', 'parallel', 'coincident', 'intersecting at (1, 3)'], 'B', 'Equal slopes and different intercepts mean the lines are parallel.'),
  numeric('mathematics/algebra/quadratic', 'medium', 'The roots of $x^2 - kx + 16 = 0$ are equal and $k > 0$. Find $k$.', 8, 'Equal roots: $k^2 - 64 = 0$, so $k = 8$.'),
  numeric('mathematics/algebra/sequences', 'easy', 'Find the sum of the infinite geometric series $1 + \\tfrac12 + \\tfrac14 + \\dots$', 2, '$S = a/(1-r) = 1/(1 - 1/2) = 2$.'),
  numeric('mathematics/calculus/derivatives', 'easy', 'Find the value of $\\frac{d}{dx}(x^2 + 3x)$ at $x = 1$.', 5, '$2x + 3 = 5$ at $x = 1$.'),
  numeric('mathematics/calculus/limits', 'medium', 'Evaluate $\\lim_{x \\to 2} \\dfrac{x^2 - 4}{x - 2}$.', 4, 'Factor: $(x-2)(x+2)/(x-2) = x + 2 \\to 4$.'),
  multi('mathematics/algebra/quadratic', 'medium', 'For the equation $x^2 - 5x + 6 = 0$, which statements are correct?', ['The roots are 2 and 3', 'The sum of the roots is 5', 'The product of the roots is −6', 'The discriminant is 1'], ['A', 'B', 'D'], '$(x-2)(x-3) = 0$. Sum $= 5$, product $= 6$, discriminant $= 25 - 24 = 1$.'),
  multi('mathematics/calculus/derivatives', 'hard', 'Which of the following functions are differentiable at $x = 0$?', ['$x^2$', '$|x|$', '$\\sin x$', '$x|x|$'], ['A', 'C', 'D'], '$|x|$ has a corner at 0. $x|x|$ has derivative $2|x|$, which exists at 0.'),
  multi('mathematics/algebra/sequences', 'medium', 'An arithmetic progression has first term 2 and common difference 3. Which statements are correct?', ['The 5th term is 14', 'The sum of the first 4 terms is 26', 'The 10th term is 30', 'Every term is of the form $3k - 1$ for a natural number $k$'], ['A', 'B', 'D'], 'Terms: 2, 5, 8, 11, 14, … The 10th term is $2 + 27 = 29$. Each term $= 3n - 1$.'),

  // ---------------- Biology
  mcq('biology/cell/organelles', 'easy', 'Which organelle is known as the powerhouse of the cell?', ['Ribosome', 'Mitochondrion', 'Golgi apparatus', 'Lysosome'], 'B', 'Mitochondria produce most of the cell\'s ATP through aerobic respiration.'),
  mcq('biology/cell/organelles', 'easy', 'Where does protein synthesis take place in a cell?', ['Ribosomes', 'Lysosomes', 'Vacuoles', 'Centrioles'], 'A', 'Ribosomes translate mRNA into polypeptide chains.'),
  mcq('biology/cell/organelles', 'medium', 'Which of these organelles contains its own DNA?', ['Golgi apparatus', 'Lysosome', 'Chloroplast', 'Endoplasmic reticulum'], 'C', 'Chloroplasts (like mitochondria) are semi-autonomous and carry their own circular DNA.'),
  mcq('biology/genetics/mendelian', 'easy', 'What is the phenotypic ratio in the F₂ generation of a Mendelian monohybrid cross?', ['1 : 2 : 1', '3 : 1', '9 : 3 : 3 : 1', '1 : 1'], 'B', 'With complete dominance, the F₂ phenotypes appear in a 3 : 1 ratio.'),
  mcq('biology/genetics/mendelian', 'medium', 'In pea plants tallness (T) is dominant over dwarfness (t). What fraction of offspring of a Tt × tt cross will be tall?', ['25%', '75%', '50%', '100%'], 'C', 'Offspring are Tt and tt in equal numbers, so half are tall.'),
  mcq('biology/genetics/mendelian', 'easy', 'What is the phenotypic ratio in the F₂ generation of a dihybrid cross?', ['3 : 1', '1 : 2 : 1', '1 : 1 : 1 : 1', '9 : 3 : 3 : 1'], 'D', 'Independent assortment of two genes gives 9 : 3 : 3 : 1.'),
  mcq('biology/physiology/circulation', 'easy', 'Which chamber of the human heart pumps oxygenated blood to the body?', ['Right atrium', 'Right ventricle', 'Left atrium', 'Left ventricle'], 'D', 'The left ventricle pumps oxygenated blood into the aorta.'),
  mcq('biology/physiology/circulation', 'medium', 'The pulmonary artery carries:', ['oxygenated blood to the lungs', 'deoxygenated blood to the lungs', 'oxygenated blood to the body', 'deoxygenated blood to the heart'], 'B', 'It is the only artery that carries deoxygenated blood, from the right ventricle to the lungs.'),
  mcq('biology/physiology/digestion', 'easy', 'Pepsin, secreted in the stomach, digests:', ['starch', 'proteins', 'fats', 'nucleic acids'], 'B', 'Pepsin is a protease that breaks proteins into peptides in acidic conditions.'),
  mcq('biology/physiology/digestion', 'easy', 'Bile is produced by the:', ['gall bladder', 'pancreas', 'liver', 'stomach'], 'C', 'Bile is made in the liver and stored in the gall bladder.'),

  // ---------------- Quantitative aptitude
  mcq('quant/arithmetic/percentage', 'easy', 'What is 15% of 640?', ['86', '96', '106', '64'], 'B', '0.15 × 640 = 96.', { stem: '640 का 15% कितना है?', options: ['86', '96', '106', '64'], explanation: '0.15 × 640 = 96' }),
  mcq('quant/arithmetic/percentage', 'medium', 'The price of an article is increased by 20% and then decreased by 20%. What is the net change?', ['No change', '4% increase', '4% decrease', '2% decrease'], 'C', '1.2 × 0.8 = 0.96, a 4% decrease.'),
  mcq('quant/arithmetic/profit-loss', 'easy', 'An article bought for ₹400 is sold for ₹500. What is the profit percentage?', ['25%', '20%', '30%', '12.5%'], 'A', 'Profit = 100 on cost 400, i.e. 25%.'),
  mcq('quant/arithmetic/interest', 'easy', 'What is the simple interest on ₹5,000 at 8% per annum for 3 years?', ['₹1,000', '₹1,400', '₹1,200', '₹1,500'], 'C', 'SI = 5000 × 8 × 3 / 100 = ₹1,200.', { stem: '₹5,000 पर 8% वार्षिक दर से 3 वर्षों का साधारण ब्याज कितना होगा?', options: ['₹1,000', '₹1,400', '₹1,200', '₹1,500'], explanation: 'साधारण ब्याज = 5000 × 8 × 3 / 100 = ₹1,200' }),
  mcq('quant/arithmetic/time-work', 'medium', 'A can finish a piece of work in 12 days and B in 24 days. Working together, how many days will they take?', ['18', '8', '9', '6'], 'B', 'Combined rate = 1/12 + 1/24 = 1/8 per day.'),
  mcq('quant/arithmetic/averages', 'easy', 'What is the average of the first 10 natural numbers?', ['5', '6', '5.5', '10'], 'C', 'Sum = 55, average = 5.5.'),
  mcq('quant/arithmetic/profit-loss', 'medium', 'A shopkeeper marks goods 25% above cost price and allows a 10% discount. What is the profit percentage?', ['15%', '12.5%', '10%', '13.5%'], 'B', '1.25 × 0.90 = 1.125, a 12.5% profit.'),
  mcq('quant/arithmetic/percentage', 'easy', 'If 40% of a number is 120, what is the number?', ['300', '480', '360', '240'], 'A', '120 / 0.4 = 300.'),
  mcq('quant/arithmetic/averages', 'easy', '₹640 is divided between A and B in the ratio 3 : 5. What is B\'s share?', ['₹240', '₹400', '₹384', '₹320'], 'B', 'B gets 5/8 × 640 = ₹400.'),

  // ---------------- Reasoning
  mcq('reasoning/verbal/series', 'easy', 'Find the next number: 2, 6, 12, 20, 30, ?', ['40', '42', '44', '36'], 'B', 'Differences are 4, 6, 8, 10, 12, so 30 + 12 = 42.', { stem: 'अगली संख्या ज्ञात कीजिए: 2, 6, 12, 20, 30, ?', options: ['40', '42', '44', '36'], explanation: 'अंतर 4, 6, 8, 10, 12 हैं, इसलिए 30 + 12 = 42' }),
  mcq('reasoning/verbal/series', 'easy', 'Find the next number: 3, 9, 27, 81, ?', ['243', '162', '324', '729'], 'A', 'Each term is multiplied by 3.'),
  mcq('reasoning/verbal/coding', 'easy', 'If CAT is coded as DBU, how is DOG coded?', ['CNF', 'EPH', 'EPG', 'FQI'], 'B', 'Each letter moves one place forward: D→E, O→P, G→H.'),
  mcq('reasoning/verbal/coding', 'medium', 'If TABLE is written as UBCMF, how is CHAIR written in that code?', ['BGZHQ', 'DIBJT', 'DIBJS', 'DHBJS'], 'C', 'Each letter moves one place forward: C→D, H→I, A→B, I→J, R→S.'),
  mcq('reasoning/verbal/analogy', 'easy', 'Book : Author :: Painting : ?', ['Canvas', 'Painter', 'Brush', 'Gallery'], 'B', 'An author creates a book; a painter creates a painting.'),
  mcq('reasoning/verbal/analogy', 'easy', 'Doctor : Hospital :: Teacher : ?', ['Student', 'Chalk', 'School', 'Examination'], 'C', 'The relationship is professional and place of work.'),
  mcq('reasoning/verbal/direction', 'medium', 'Ravi walks 5 km north, turns right and walks 3 km, then turns right again and walks 5 km. How far is he from his starting point?', ['3 km', '5 km', '8 km', '13 km'], 'A', 'He ends 3 km east of the starting point.'),
  mcq('reasoning/verbal/series', 'easy', 'Find the odd one out: 16, 25, 36, 48, 64', ['25', '36', '48', '64'], 'C', 'All others are perfect squares.'),

  // ---------------- English
  mcq('english/vocabulary/synonyms', 'easy', 'Choose the word closest in meaning to ABUNDANT.', ['Scarce', 'Plentiful', 'Rare', 'Tiny'], 'B', 'Abundant means existing in large quantities: plentiful.'),
  mcq('english/vocabulary/antonyms', 'easy', 'Choose the word opposite in meaning to ANCIENT.', ['Old', 'Antique', 'Modern', 'Ageless'], 'C', 'Ancient means very old; modern is its opposite.'),
  mcq('english/vocabulary/synonyms', 'medium', 'Choose the word closest in meaning to CANDID.', ['Frank', 'Secretive', 'Cunning', 'Timid'], 'A', 'Candid means truthful and straightforward.'),
  mcq('english/vocabulary/antonyms', 'easy', 'Choose the word opposite in meaning to EXPAND.', ['Enlarge', 'Contract', 'Extend', 'Swell'], 'B', 'To contract is to become smaller.'),
  mcq('english/grammar/errors', 'medium', 'Identify the part with an error: "Neither of the two boys (A) / have completed (B) / their homework. (C) / No error (D)"', ['A', 'B', 'C', 'D'], 'B', '"Neither" is singular, so it should be "has completed".'),
  mcq('english/grammar/blanks', 'easy', 'She has been living here ___ 2015.', ['for', 'since', 'from', 'by'], 'B', '"Since" is used with a point in time.'),
  mcq('english/grammar/blanks', 'easy', 'He is very good ___ mathematics.', ['in', 'on', 'at', 'with'], 'C', 'The correct collocation is "good at".'),
  mcq('english/grammar/errors', 'medium', 'Identify the part with an error: "The news (A) / are very encouraging (B) / for all of us. (C) / No error (D)"', ['A', 'B', 'C', 'D'], 'B', '"News" is uncountable and takes a singular verb: "is very encouraging".'),

  // ---------------- General Studies
  mcq('gs/polity/constitution', 'medium', 'Which of these words was added to the Preamble of the Constitution of India by the 42nd Amendment Act, 1976?', ['Sovereign', 'Republic', 'Socialist', 'Democratic'], 'C', 'The 42nd Amendment added "Socialist", "Secular" and "Integrity".'),
  mcq('gs/polity/constitution', 'easy', 'In which Article of the Constitution of India are the Fundamental Duties listed?', ['Article 21', 'Article 32', 'Article 51A', 'Article 370'], 'C', 'Article 51A, in Part IV-A, lists the Fundamental Duties.', { stem: 'भारत के संविधान के किस अनुच्छेद में मौलिक कर्तव्य सूचीबद्ध हैं?', options: ['अनुच्छेद 21', 'अनुच्छेद 32', 'अनुच्छेद 51क', 'अनुच्छेद 370'], explanation: 'भाग 4क का अनुच्छेद 51क मौलिक कर्तव्यों को सूचीबद्ध करता है।' }),
  mcq('gs/polity/constitution', 'easy', 'Which Article guarantees the Right to Constitutional Remedies?', ['Article 32', 'Article 14', 'Article 19', 'Article 44'], 'A', 'Article 32 lets citizens move the Supreme Court to enforce Fundamental Rights.'),
  mcq('gs/polity/parliament', 'easy', 'A Money Bill can be introduced only in:', ['the Rajya Sabha', 'the Lok Sabha', 'either House', 'a joint sitting'], 'B', 'Under Article 109 a Money Bill can be introduced only in the Lok Sabha.', { stem: 'धन विधेयक केवल कहाँ प्रस्तुत किया जा सकता है?', options: ['राज्य सभा में', 'लोक सभा में', 'किसी भी सदन में', 'संयुक्त बैठक में'], explanation: 'अनुच्छेद 109 के अंतर्गत धन विधेयक केवल लोक सभा में प्रस्तुत किया जा सकता है।' }),
  mcq('gs/polity/parliament', 'medium', 'What is the maximum strength of the Rajya Sabha permitted by the Constitution?', ['245', '250', '238', '552'], 'B', 'Article 80 allows up to 250 members: 238 elected and 12 nominated.'),
  mcq('gs/polity/parliament', 'hard', 'Consider the following statements about the Comptroller and Auditor General of India:\n1. The CAG is appointed by the President.\n2. The CAG can be removed only in the manner and on the grounds of a Supreme Court judge.\nWhich of the statements given above is/are correct?', ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'], 'C', 'Article 148 provides for appointment by the President and removal like a Supreme Court judge.'),
  mcq('gs/history/national-movement', 'easy', 'In which year was the Indian National Congress founded?', ['1857', '1905', '1920', '1885'], 'D', 'The INC held its first session in Bombay in December 1885.'),
  mcq('gs/history/national-movement', 'easy', 'The Quit India Movement was launched in:', ['1930', '1919', '1942', '1947'], 'C', 'It was launched in August 1942.'),
  mcq('gs/history/national-movement', 'easy', 'The Dandi March of 1930 was undertaken to protest against:', ['the salt tax', 'the Rowlatt Act', 'the Partition of Bengal', 'the Simon Commission'], 'A', 'Gandhi marched to Dandi to make salt in defiance of the salt law.'),
  mcq('gs/geography/physiography', 'medium', 'Which river is known as the "Dakshin Ganga"?', ['Krishna', 'Godavari', 'Kaveri', 'Mahanadi'], 'B', 'The Godavari, the largest peninsular river, is called Dakshin Ganga.'),
  mcq('gs/geography/physiography', 'medium', 'The Tropic of Cancer does NOT pass through which of these states?', ['Gujarat', 'Odisha', 'Tripura', 'Jharkhand'], 'B', 'It passes through Gujarat, Rajasthan, Madhya Pradesh, Chhattisgarh, Jharkhand, West Bengal, Tripura and Mizoram.'),
  mcq('gs/geography/physiography', 'medium', 'Which is the highest peak of the Western Ghats?', ['Doddabetta', 'Anamudi', 'Mahendragiri', 'Guru Shikhar'], 'B', 'Anamudi in Kerala (about 2,695 m) is the highest peak of the Western Ghats.'),
  mcq('gs/economy/banking', 'easy', 'In which year was the Reserve Bank of India established?', ['1935', '1947', '1949', '1969'], 'A', 'The RBI began operations on 1 April 1935.'),
  mcq('gs/economy/banking', 'easy', 'The Goods and Services Tax (GST) came into effect in India on:', ['1 April 2016', '1 July 2017', '1 January 2018', '8 November 2016'], 'B', 'GST was rolled out on 1 July 2017.'),
  mcq('gs/economy/banking', 'medium', 'The repo rate is the rate at which:', ['commercial banks lend to the RBI', 'the RBI lends short-term funds to commercial banks', 'banks lend to their best customers', 'the Government borrows from the World Bank'], 'B', 'The RBI lends to banks against government securities at the repo rate.'),
  mcq('gs/science/everyday', 'easy', 'Deficiency of which vitamin causes scurvy?', ['Vitamin A', 'Vitamin B₁₂', 'Vitamin C', 'Vitamin D'], 'C', 'Vitamin C (ascorbic acid) is needed for collagen formation.', { stem: 'किस विटामिन की कमी से स्कर्वी रोग होता है?', options: ['विटामिन A', 'विटामिन B₁₂', 'विटामिन C', 'विटामिन D'], explanation: 'विटामिन C कोलेजन निर्माण के लिए आवश्यक है।' }),
  mcq('gs/science/everyday', 'easy', 'What is the SI unit of electric current?', ['Ampere', 'Volt', 'Ohm', 'Watt'], 'A', 'The ampere is one of the seven SI base units.'),
  mcq('gs/science/everyday', 'easy', 'Which gas makes up the largest share of Earth\'s atmosphere?', ['Oxygen', 'Nitrogen', 'Argon', 'Carbon dioxide'], 'B', 'Nitrogen is about 78% of dry air by volume.'),

  // ---------------- Descriptive (UPSC Mains style)
  descriptive('gs/polity/constitution', 'hard', 'Discuss the significance of the basic structure doctrine in preserving constitutional supremacy in India. (150 words)', 10, 150,
    'Points to cover: origin in Kesavananda Bharati (1973); limits on Parliament\'s amending power under Article 368; elements such as judicial review, federalism, secularism, free and fair elections; later affirmation (e.g. Minerva Mills); balance between flexibility and permanence; critique about judicial overreach.'),
  descriptive('gs/polity/parliament', 'hard', 'Examine the role of the Rajya Sabha as a chamber representing the states. (150 words)', 10, 150,
    'Points to cover: indirect election by state legislatures; special powers under Articles 249 and 312; continuity as a permanent House; revising role; limitations in money bills; debates on unequal representation and domicile requirement.'),
];

// A few items left in the workflow so the review queue has something in it.
export const WORKFLOW_QUESTIONS = [
  { status: 'in_review', q: mcq('gs/geography/physiography', 'easy', 'Which Indian state has the longest coastline?', ['Tamil Nadu', 'Andhra Pradesh', 'Gujarat', 'Maharashtra'], 'C', 'Gujarat has the longest coastline among Indian states.') },
  { status: 'in_review', q: mcq('chemistry/mole-concept/stoichiometry', 'easy', 'The value of the Avogadro constant is approximately:', ['$6.022\\times10^{23}\\,\\text{mol}^{-1}$', '$3.0\\times10^{8}\\,\\text{mol}^{-1}$', '$1.6\\times10^{-19}\\,\\text{mol}^{-1}$', '$9.1\\times10^{-31}\\,\\text{mol}^{-1}$'], 'A', 'The Avogadro constant is $6.022\\times10^{23}\\,\\text{mol}^{-1}$.') },
  { status: 'draft', q: mcq('physics/laws-of-motion/friction', 'medium', 'Kinetic friction compared with limiting static friction is usually:', ['greater', 'smaller', 'equal', 'zero'], 'B', 'The coefficient of kinetic friction is usually smaller than that of static friction.') },
];
