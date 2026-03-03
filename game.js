/* ═══════════════════════════════════════════════════════════════════
   INDY DESIGN THINKING QUEST — Game Logic
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Sound Engine (Web Audio API — no external files needed) ─────── */
const Sound = (() => {
  let ctx = null;
  let enabled = true;

  /** Lazily create AudioContext on first user gesture */
  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported:', e);
        enabled = false;
      }
    }
    // Resume if suspended (browser auto-suspend policy)
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  /** Play a sequence of notes (melody) */
  function playMelody(notes, baseTime) {
    if (!enabled) return;
    const c = getCtx();
    if (!c) return;
    const t = baseTime || c.currentTime;
    notes.forEach(([freq, dur, vol = 0.25, type = 'sine', delayStart = 0]) => {
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + delayStart);
      gain.gain.setValueAtTime(vol, t + delayStart);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delayStart + dur);
      osc.start(t + delayStart);
      osc.stop(t + delayStart + dur + 0.05);
    });
  }

  /** Noise burst (for error/wrong) */
  function playNoise(dur = 0.15, vol = 0.12) {
    if (!enabled) return;
    const c = getCtx();
    if (!c) return;
    const bufSize = c.sampleRate * dur;
    const buf  = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const src  = c.createBufferSource();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    src.buffer = buf;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.start();
    src.stop(c.currentTime + dur + 0.05);
  }

  // ── Public sound effects ────────────────────────────────────────
  return {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },

    /** Click / UI tap */
    click() {
      playMelody([[880, 0.08, 0.15, 'sine', 0], [1100, 0.06, 0.1, 'sine', 0.06]]);
    },

    /** Correct answer */
    correct() {
      playMelody([
        [523, 0.1,  0.2, 'sine',   0],
        [659, 0.1,  0.2, 'sine',   0.1],
        [784, 0.15, 0.2, 'sine',   0.2],
        [1047,0.3,  0.2, 'sine',   0.35],
      ]);
    },

    /** Wrong answer */
    wrong() {
      playNoise(0.2, 0.1);
      playMelody([
        [300, 0.12, 0.15, 'sawtooth', 0],
        [260, 0.2,  0.12, 'sawtooth', 0.15],
      ]);
    },

    /** Stage complete fanfare */
    stageComplete() {
      playMelody([
        [523, 0.12, 0.22, 'sine', 0],
        [659, 0.12, 0.22, 'sine', 0.12],
        [784, 0.12, 0.22, 'sine', 0.24],
        [1047,0.12, 0.22, 'sine', 0.36],
        [1319,0.35, 0.22, 'sine', 0.48],
        [784, 0.1,  0.15, 'sine', 0.85],
        [1047,0.4,  0.22, 'sine', 0.95],
      ]);
    },

    /** Victory full fanfare */
    victory() {
      const notes = [
        [523,0.12,0.25,'sine',0],[659,0.12,0.25,'sine',0.12],[784,0.12,0.25,'sine',0.24],
        [1047,0.2,0.25,'sine',0.36],[1319,0.2,0.25,'sine',0.56],[1047,0.1,0.2,'sine',0.76],
        [1175,0.1,0.2,'sine',0.86],[1319,0.1,0.2,'sine',0.96],[1568,0.6,0.3,'sine',1.06],
      ];
      playMelody(notes);
    },

    /** XP gain chime */
    xp() {
      playMelody([
        [880, 0.08, 0.15, 'sine', 0],
        [1174,0.15, 0.12, 'sine', 0.08],
      ]);
    },

    /** Life lost */
    lifeLost() {
      playMelody([
        [400, 0.12, 0.15, 'triangle', 0],
        [320, 0.2,  0.12, 'triangle', 0.14],
        [260, 0.3,  0.1,  'triangle', 0.35],
      ]);
    },

    /** Character select */
    select() {
      playMelody([
        [660, 0.1,  0.18, 'sine', 0],
        [880, 0.1,  0.18, 'sine', 0.1],
        [1100,0.15, 0.18, 'sine', 0.2],
      ]);
    },

    /** Power-up / bonus */
    powerup() {
      playMelody([
        [440,0.06,0.15,'square',0],[494,0.06,0.15,'square',0.06],
        [523,0.06,0.15,'square',0.12],[587,0.06,0.15,'square',0.18],
        [659,0.06,0.15,'square',0.24],[698,0.06,0.15,'square',0.3],
        [784,0.2, 0.2,'square',0.36],
      ]);
    },
  };
})();

/* ── Confetti ─────────────────────────────────────────────────────── */
const Confetti = (() => {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];
  let animId   = null;

  const COLORS = ['#6c63ff','#ff6584','#ffd700','#2ecc71','#00d4ff','#f39c12','#e74c3c'];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function spawn(n = 120) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x:  Math.random() * canvas.width,
        y:  -10 - Math.random() * 100,
        w:  6  + Math.random() * 8,
        h:  10 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: 2  + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rv:  (Math.random() - 0.5) * 0.15,
        fade: 1,
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += 0.05;   // gravity
      p.rot += p.rv;
      if (p.y > canvas.height - 60) p.fade -= 0.02;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.fade);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    particles = particles.filter(p => p.fade > 0);
    if (particles.length > 0) {
      animId = requestAnimationFrame(tick);
    } else {
      animId = null;
    }
  }

  return {
    burst(n = 120) {
      spawn(n);
      if (!animId) animId = requestAnimationFrame(tick);
    },
    stop() {
      particles = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    },
  };
})();

/* ── Stars background ─────────────────────────────────────────────── */
function createStars(containerId, count = 80) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = 1 + Math.random() * 2.5;
    s.style.cssText = `
      left:${Math.random()*100}%;
      top:${Math.random()*100}%;
      width:${size}px; height:${size}px;
      --d:${2+Math.random()*4}s;
      animation-delay:${Math.random()*4}s;
    `;
    el.appendChild(s);
  }
}

/* ── Game Data ────────────────────────────────────────────────────── */
const STAGES = [
  {
    id: 'empathize',
    name: 'Empathize',
    icon: '🤝',
    badge: '🎧',
    color: '#00d4ff',
    tip: '💡 Design Thinking Tip: Empathy means stepping into someone else\'s world. Great designers spend 50% of their time here!',
    insight: '"You cannot design for someone you don\'t understand." The best products start with listening deeply to the people who will use them.',
    xpReward: 150,
    questions: [
      {
        scenario: '📍 SCENARIO: A school cafeteria is redesigning its lunch experience.',
        text: 'You want to understand student frustrations with the lunch line. Which method BEST captures real empathy?',
        answers: [
          { text: '📋 Send a survey with multiple-choice options', correct: false },
          { text: '🎤 Interview students while standing in line with them', correct: true },
          { text: '📊 Review last year\'s cafeteria complaint statistics', correct: false },
          { text: '📧 Email the principal for their opinion', correct: false },
        ],
        explanation: '✅ Standing in line WITH students lets you observe body language, emotions, and spontaneous comments—true empathy in action!'
      },
      {
        scenario: '📍 SCENARIO: You\'re designing a new school app.',
        text: 'A student says "The homework tracker is fine." What is the BEST next step?',
        answers: [
          { text: '👍 Great! Move on to the next feature.', correct: false },
          { text: '🔍 Ask "What would make it even better?"', correct: true },
          { text: '📝 Document "User is satisfied" and close the ticket', correct: false },
          { text: '🚀 Launch the app immediately', correct: false },
        ],
        explanation: '✅ "Fine" often hides unspoken frustrations. Probe deeper with "even better"—users rarely volunteer their deepest needs!'
      },
      {
        scenario: '📍 SCENARIO: You\'re improving the school library.',
        text: 'Which of these is an EMPATHY observation (not an assumption)?',
        answers: [
          { text: '🤔 "Students probably want more computers"', correct: false },
          { text: '📝 "Students keep asking librarians for power outlets"', correct: true },
          { text: '💭 "Teens don\'t like reading physical books"', correct: false },
          { text: '💡 "We should add a gaming section"', correct: false },
        ],
        explanation: '✅ Real observations come from what you actually see and hear—not what you assume! "Students asking for outlets" is a direct, observed need.'
      },
      {
        scenario: '📍 SCENARIO: Redesigning the school bus experience.',
        text: 'You notice a student always sits alone and looks out the window. What is the EMPATHETIC response?',
        answers: [
          { text: '🙈 Don\'t disturb them—they clearly want privacy', correct: false },
          { text: '📢 Announce a new "buddy system" to the whole bus', correct: false },
          { text: '💬 Gently ask if they\'re okay and what they enjoy about the ride', correct: true },
          { text: '📋 Add "student seemed lonely" to your report', correct: false },
        ],
        explanation: '✅ True empathy is human—it means connecting, not just observing from a distance. A genuine conversation reveals far more!'
      },
    ]
  },
  {
    id: 'define',
    name: 'Define',
    icon: '🎯',
    badge: '🎯',
    color: '#ff6584',
    tip: '💡 Design Thinking Tip: A well-defined problem is half the solution. Write your problem statement as: "How might we [action] so that [user] can [outcome]?"',
    insight: '"A problem well stated is a problem half-solved." — Charles Kettering. Defining the RIGHT problem prevents building the wrong solution!',
    xpReward: 175,
    questions: [
      {
        scenario: '📍 SCENARIO: Students say the school website is confusing.',
        text: 'Which is the BEST "How Might We" (HMW) problem statement?',
        answers: [
          { text: '🌐 "How might we redesign the entire website?"', correct: false },
          { text: '🎯 "How might we help students find class schedules in under 10 seconds?"', correct: true },
          { text: '💻 "How might we add more features to the website?"', correct: false },
          { text: '📱 "How might we build a new mobile app instead?"', correct: false },
        ],
        explanation: '✅ Great HMW statements are specific, user-centered, and focused on an outcome—not a solution. "Find schedules in 10 seconds" gives designers a clear target!'
      },
      {
        scenario: '📍 SCENARIO: You gathered data on the cafeteria problem.',
        text: 'Your data shows: 40% skip lunch, 70% say lines are too long, 55% want healthier options. What should your problem statement focus on?',
        answers: [
          { text: '🥗 "How might we add healthier food options?"', correct: false },
          { text: '⏱️ "How might we reduce wait time so more students eat lunch?"', correct: true },
          { text: '🍕 "How might we redesign the entire cafeteria menu?"', correct: false },
          { text: '💰 "How might we lower the price of school lunch?"', correct: false },
        ],
        explanation: '✅ The strongest signal is that 40% SKIP lunch and 70% cite long lines—addressing wait time directly impacts the most students!'
      },
      {
        scenario: '📍 SCENARIO: A student\'s HMW statement reads: "How might we buy new computers for the library?"',
        text: 'What is WRONG with this problem statement?',
        answers: [
          { text: '📝 It\'s too long', correct: false },
          { text: '💡 It jumps to a solution (buying computers) instead of defining the problem', correct: true },
          { text: '📚 It doesn\'t mention the library enough', correct: false },
          { text: '🖥️ Computers aren\'t a good solution', correct: false },
        ],
        explanation: '✅ HMW statements should define the PROBLEM, not prescribe the solution. "Buying computers" is an answer, not a question—keep the definition open!'
      },
      {
        scenario: '📍 SCENARIO: Defining a problem for a school anxiety app.',
        text: 'Which problem statement best captures the USER\'S perspective?',
        answers: [
          { text: '😰 "How might we reduce student stress?"', correct: false },
          { text: '📱 "How might we build a meditation app?"', correct: false },
          { text: '🤝 "How might we help anxious students access calming strategies during a test?"', correct: true },
          { text: '🎓 "How might we train teachers to spot anxious students?"', correct: false },
        ],
        explanation: '✅ The best statement is specific about WHO (anxious students), WHEN (during a test), and WHAT (calming strategies)—giving designers a precise, actionable target!'
      },
    ]
  },
  {
    id: 'ideate',
    name: 'Ideate',
    icon: '💡',
    badge: '💡',
    color: '#ffd700',
    tip: '💡 Design Thinking Tip: During ideation, quantity beats quality! Wild ideas spark unexpected solutions. "Yes, and..." beats "No, but..."',
    insight: '"You can\'t use up creativity. The more you use, the more you have." — Maya Angelou. Brainstorming without judgment unlocks breakthroughs!',
    xpReward: 200,
    sortChallenge: {
      title: '💡 Sort these brainstorm behaviors!',
      instruction: 'Click each idea to assign it to the correct category. Good brainstorming rules vs. Bad brainstorming rules.',
      colA: 'GOOD Brainstorm Rules ✅',
      colB: 'BAD Brainstorm Rules ❌',
      items: [
        { text: '"Build on others\' ideas"', bucket: 'a' },
        { text: '"One conversation at a time"', bucket: 'a' },
        { text: '"Wild ideas are welcome!"', bucket: 'a' },
        { text: '"Defer judgment"', bucket: 'a' },
        { text: '"Go for quantity"', bucket: 'a' },
        { text: '"Only share practical ideas"', bucket: 'b' },
        { text: '"Vote on the first good idea"', bucket: 'b' },
        { text: '"Criticize unrealistic suggestions"', bucket: 'b' },
      ]
    },
    questions: [
      {
        scenario: '📍 SCENARIO: Brainstorming ideas for a new school app.',
        text: 'A teammate suggests "What if the app could predict homework deadlines using AI?" You think it\'s impossible. What do you say?',
        answers: [
          { text: '🚫 "That\'s way too expensive, let\'s be realistic"', correct: false },
          { text: '🤔 "Hmm, maybe. Can we simplify that idea first?"', correct: false },
          { text: '✨ "Yes! And what if it also sent reminders to parents?"', correct: true },
          { text: '😶 Nothing—just write down your own better idea', correct: false },
        ],
        explanation: '✅ "Yes, and..." builds momentum! Wild ideas can always be scaled back, but they often inspire the breakthrough that becomes real.'
      },
      {
        scenario: '📍 SCENARIO: You have 10 minutes to brainstorm.',
        text: 'Which technique helps generate the MOST diverse ideas quickly?',
        answers: [
          { text: '📝 Each person writes ideas alone, then share all at once (Brainwriting)', correct: true },
          { text: '🗣️ Go around the table one person at a time', correct: false },
          { text: '🏆 The loudest voice in the room leads', correct: false },
          { text: '📊 Rank ideas by likelihood to succeed first', correct: false },
        ],
        explanation: '✅ Brainwriting lets introverts shine and prevents "groupthink" where the first loud idea dominates. You get MORE and MORE DIVERSE ideas!'
      },
      {
        scenario: '📍 SCENARIO: Your team has 47 ideas on sticky notes.',
        text: 'What is the BEST next step after a big brainstorm?',
        answers: [
          { text: '🗑️ Eliminate all "crazy" ideas immediately', correct: false },
          { text: '🗳️ Vote for only ONE idea and commit to it', correct: false },
          { text: '🗂️ Cluster similar ideas into themes, then dot-vote your favorites', correct: true },
          { text: '⏰ Keep brainstorming—47 ideas isn\'t enough', correct: false },
        ],
        explanation: '✅ Clustering reveals patterns and themes. Dot-voting lets everyone have a voice without endless debate—it\'s how design teams narrow down to the best candidates!'
      },
    ]
  },
  {
    id: 'prototype',
    name: 'Prototype',
    icon: '🛠',
    badge: '🛠',
    color: '#2ecc71',
    tip: '💡 Design Thinking Tip: The goal of a prototype is to LEARN, not to be perfect. A prototype made in 1 hour that fails teaches you more than a polished product nobody tests!',
    insight: '"If a picture is worth 1,000 words, a prototype is worth 1,000 meetings." Build something tangible as quickly as possible to unlock real feedback!',
    xpReward: 200,
    questions: [
      {
        scenario: '📍 SCENARIO: You\'re designing a new school locker system.',
        text: 'What is the FASTEST useful prototype you could build TODAY?',
        answers: [
          { text: '🏗️ Build a full working locker from metal and wood', correct: false },
          { text: '📦 Create a cardboard model of the locker and let students interact with it', correct: true },
          { text: '💻 Write a 50-page specification document', correct: false },
          { text: '📊 Present a slide deck showing the final vision', correct: false },
        ],
        explanation: '✅ A cardboard prototype takes minutes to build and can be tested immediately! You\'ll learn more from 10 minutes of student testing than weeks of planning.'
      },
      {
        scenario: '📍 SCENARIO: Prototyping a mobile app.',
        text: 'Which prototype lets you test user FLOW and navigation with the LEAST effort?',
        answers: [
          { text: '💻 A fully coded app with real data', correct: false },
          { text: '🖼️ Paper sketches of each screen taped together', correct: true },
          { text: '🎨 A beautiful high-fidelity Figma mockup', correct: false },
          { text: '📖 A written description of every feature', correct: false },
        ],
        explanation: '✅ Paper prototypes take 20 minutes and reveal navigation confusion instantly! Save coding for AFTER you\'ve validated the flow with real users.'
      },
      {
        scenario: '📍 SCENARIO: Your first prototype gets bad feedback.',
        text: 'A student says "I had no idea how to start using this." How do you respond?',
        answers: [
          { text: '😤 The student just didn\'t try hard enough', correct: false },
          { text: '🎉 This is GREAT data—redesign the onboarding experience', correct: true },
          { text: '📋 Add a 10-page instruction manual', correct: false },
          { text: '🚀 Launch it anyway—most users will figure it out', correct: false },
        ],
        explanation: '✅ "Bad" feedback is GOLDEN feedback! It tells you exactly what to fix. Design thinkers celebrate failures because each one brings the solution closer!'
      },
      {
        scenario: '📍 SCENARIO: You\'re deciding how detailed to make your prototype.',
        text: 'When should you invest in a HIGH-FIDELITY (polished) prototype?',
        answers: [
          { text: '🥇 Always—only polished prototypes give valid feedback', correct: false },
          { text: '🔄 After you\'ve validated the core idea with low-fidelity prototypes', correct: true },
          { text: '⏱️ When you have extra time before a deadline', correct: false },
          { text: '🎨 When stakeholders ask for something impressive', correct: false },
        ],
        explanation: '✅ Build fidelity gradually. Low-fi first validates the idea. High-fi validates the details. Jumping to polish too early wastes time on the wrong idea!'
      },
    ]
  },
  {
    id: 'test',
    name: 'Test',
    icon: '🧪',
    badge: '🏆',
    color: '#8b5cf6',
    tip: '💡 Design Thinking Tip: When testing, your job is to LISTEN—not defend your design. Silence is golden: watch what users do, not just what they say!',
    insight: '"Test early, test often, test with real users." The best designs are shaped by feedback from the people who actually use them—not the people who built them.',
    xpReward: 225,
    questions: [
      {
        scenario: '📍 SCENARIO: Testing your new cafeteria app prototype.',
        text: 'You ask a student to find the lunch menu. They struggle for 2 minutes. What is the BEST designer response?',
        answers: [
          { text: '💬 "It\'s the blue button on the left—just click that!"', correct: false },
          { text: '🤐 Stay silent and watch what they do (take notes)', correct: true },
          { text: '😅 Apologize and explain the interface', correct: false },
          { text: '📝 Skip this user—they\'re clearly not tech-savvy', correct: false },
        ],
        explanation: '✅ During testing, silence is data! If you explain, you\'re helping them use YOUR design instead of testing if the design works by itself. Watch, don\'t guide!'
      },
      {
        scenario: '📍 SCENARIO: Analyzing test results.',
        text: 'After testing with 5 students, 4 had the same problem. What should you do?',
        answers: [
          { text: '📊 Test with 100 more students to confirm the data', correct: false },
          { text: '🔄 Iterate on your design to fix that specific problem', correct: true },
          { text: '🤷 Dismiss it—4 out of 5 could just be coincidence', correct: false },
          { text: '📋 Document it and plan to fix it in version 2.0', correct: false },
        ],
        explanation: '✅ In design thinking, 5 users typically reveal 85% of usability problems. If 4/5 share the same issue, that\'s a critical bug—fix it now, then test again!'
      },
      {
        scenario: '📍 SCENARIO: A student tester says "This is fine."',
        text: 'How do you get RICHER feedback from this student?',
        answers: [
          { text: '✅ Great! Mark test as successful and move on', correct: false },
          { text: '🎯 Ask "Can you show me exactly what you\'d do next?"', correct: true },
          { text: '📋 Ask them to fill out a 20-question rating form', correct: false },
          { text: '🗣️ Tell them what you were HOPING they would notice', correct: false },
        ],
        explanation: '✅ "Show me" is the magic phrase in user testing! Observing behavior reveals gaps between what users SAY and what they actually DO—the richest source of insights!'
      },
      {
        scenario: '📍 SCENARIO: You\'ve run 3 rounds of testing and iteration.',
        text: 'When do you STOP iterating and launch your solution?',
        answers: [
          { text: '⏰ When you\'ve run out of time on the project', correct: false },
          { text: '😤 When users stop finding new problems', correct: false },
          { text: '✅ When core user needs are met and new tests show minimal blockers', correct: true },
          { text: '🏆 When everyone on your team loves it', correct: false },
        ],
        explanation: '✅ You never achieve perfection—but you reach "good enough to launch." The signal is when users can accomplish their goals with minimal friction. Ship, then keep improving!'
      },
    ]
  },
];

/* ── Game State ───────────────────────────────────────────────────── */
const State = {
  char:        null,   // { name, avatar, power, quote }
  stageIndex:  0,
  questionIdx: 0,
  score:       0,
  xp:          0,
  lives:       3,
  badgesEarned:[],
  inSortChallenge: false,
  sortAssigned: {},    // itemId -> 'a' | 'b'
  sortData:    null,

  reset() {
    this.stageIndex  = 0;
    this.questionIdx = 0;
    this.score       = 0;
    this.xp          = 0;
    this.lives       = 3;
    this.badgesEarned= [];
    this.inSortChallenge = false;
    this.sortAssigned    = {};
    this.sortData        = null;
  },

  get currentStage() { return STAGES[this.stageIndex]; },
  get maxXP()        { return STAGES.length * 225; },
};

/* ── Screen Management ────────────────────────────────────────────── */
const SCREENS = [
  'title','character','stage-intro','question','sort','stage-complete','gameover','victory'
];

function showScreen(name) {
  SCREENS.forEach(id => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.toggle('active', id === name);
  });
}

/* ── HUD ──────────────────────────────────────────────────────────── */
function updateHUD() {
  const hud = document.getElementById('hud');
  hud.classList.toggle('hidden', State.stageIndex >= STAGES.length);
  if (State.stageIndex >= STAGES.length) return;

  document.getElementById('hud-char').textContent  = `${State.char.avatar} ${State.char.name}`;
  document.getElementById('hud-score').textContent = State.score;
  document.getElementById('hud-lives').textContent = State.lives;
  document.getElementById('hud-xp').textContent    = `${State.xp} XP`;

  const pct = Math.min(100, (State.xp / State.maxXP) * 100);
  document.getElementById('xp-bar').style.width = `${pct}%`;

  // Stage tracker dots
  const tracker = document.getElementById('stage-tracker');
  tracker.innerHTML = '';
  STAGES.forEach((s, i) => {
    if (i > 0) {
      const conn = document.createElement('div');
      conn.className = 'stage-connector' + (i <= State.stageIndex ? ' done' : '');
      tracker.appendChild(conn);
    }
    const dot = document.createElement('div');
    dot.className = 'stage-dot' +
      (i < State.stageIndex ? ' done' : '') +
      (i === State.stageIndex ? ' current' : '');
    dot.title = s.name;
    tracker.appendChild(dot);
  });
}

function syncSoundButtons() {
  const label = Sound.enabled ? '🔊' : '🔇';
  ['btn-sound','btn-sound-hud'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
  const wrap = document.querySelector('.sound-toggle-wrap span');
  if (wrap) wrap.textContent = Sound.enabled ? 'Sound ON' : 'Sound OFF';
}

/* ── Toast ────────────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, dur = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), dur);
}

/* ── Screen: Title ────────────────────────────────────────────────── */
function goToTitle() {
  Confetti.stop();
  document.getElementById('hud').classList.add('hidden');
  createStars('stars', 80);
  showScreen('title');
}

function toggleSound() {
  Sound.enabled = !Sound.enabled;
  syncSoundButtons();
  if (Sound.enabled) Sound.click();
  showToast(Sound.enabled ? '🔊 Sound ON' : '🔇 Sound OFF');
}

/* ── Screen: Character ────────────────────────────────────────────── */
function goToCharacter() {
  Sound.click();
  State.reset();
  showScreen('character');
}

function selectCharacter(el, name, avatar, power, quote) {
  Sound.select();
  State.char = { name, avatar, power, quote };

  // Visual feedback
  document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  setTimeout(() => {
    updateHUD();
    document.getElementById('hud').classList.remove('hidden');
    showStageIntro();
  }, 600);
}

/* ── Stage Intro ──────────────────────────────────────────────────── */
function showStageIntro() {
  const s = State.currentStage;
  document.getElementById('intro-icon').textContent      = s.icon;
  document.getElementById('intro-stage-num').textContent = `Stage ${State.stageIndex + 1} of ${STAGES.length}`;
  document.getElementById('intro-stage-name').textContent= s.name;
  document.getElementById('intro-stage-desc').textContent= s.tip.replace('💡 Design Thinking Tip: ', '');
  document.getElementById('intro-tip').textContent       = s.tip;
  showScreen('stage-intro');
}

function startStage() {
  Sound.click();
  const stage = State.currentStage;
  State.questionIdx = 0;
  State.inSortChallenge = false;

  // Does this stage have a sort challenge that comes before questions?
  if (stage.sortChallenge && State.stageIndex === 2) {
    showSortChallenge();
  } else {
    showQuestion();
  }
}

/* ── Questions ────────────────────────────────────────────────────── */
function showQuestion() {
  const stage = State.currentStage;
  const q     = stage.questions[State.questionIdx];
  if (!q) { endStage(); return; }

  document.getElementById('q-stage-tag').textContent = `${stage.icon} ${stage.name}`;
  document.getElementById('q-num').textContent = `Q ${State.questionIdx + 1} / ${stage.questions.length}`;
  document.getElementById('scenario-label').textContent = q.scenario || '';
  document.getElementById('question-text').textContent  = q.text;

  const feedback = document.getElementById('feedback-banner');
  feedback.className = 'feedback-banner hidden';

  const container = document.getElementById('answers');
  container.innerHTML = '';
  q.answers.forEach((a, i) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = a.text;
    btn.addEventListener('click', () => handleAnswer(a, btn, q));
    container.appendChild(btn);
  });

  showScreen('question');
}

function handleAnswer(answer, btn, q) {
  Sound.click();
  // Disable all buttons
  document.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);

  const feedback = document.getElementById('feedback-banner');
  const icon     = document.getElementById('feedback-icon');
  const text     = document.getElementById('feedback-text');

  if (answer.correct) {
    btn.classList.add('correct');
    Sound.correct();
    const pts = 100;
    State.score += pts;
    State.xp    += 50;
    updateHUD();
    icon.textContent = '✅';
    text.textContent = q.explanation;
    feedback.className = 'feedback-banner correct-bg';
    showToast(`+${pts} pts • +50 XP 🌟`);
    Sound.xp();
    setTimeout(() => advanceQuestion(), 2800);
  } else {
    btn.classList.add('wrong');
    btn.classList.add('shake');
    Sound.wrong();
    State.lives--;
    updateHUD();
    // Show correct answer
    document.querySelectorAll('.answer-btn').forEach(b => {
      const aData = q.answers.find(a => a.text === b.textContent);
      if (aData && aData.correct) b.classList.add('correct');
    });
    icon.textContent = '❌';
    text.textContent = q.explanation;
    feedback.className = 'feedback-banner wrong-bg';
    if (State.lives <= 0) {
      Sound.lifeLost();
      setTimeout(() => showScreen('gameover'), 2400);
    } else {
      Sound.lifeLost();
      showToast(`❤️ ${State.lives} ${State.lives === 1 ? 'life' : 'lives'} remaining`);
      setTimeout(() => advanceQuestion(), 2800);
    }
  }
}

function advanceQuestion() {
  State.questionIdx++;
  const stage = State.currentStage;
  if (State.questionIdx >= stage.questions.length) {
    endStage();
  } else {
    showQuestion();
  }
}

/* ── Sort Challenge ───────────────────────────────────────────────── */
function showSortChallenge() {
  const stage = State.currentStage;
  const sort  = stage.sortChallenge;
  State.sortData     = sort;
  State.sortAssigned = {};
  State.inSortChallenge = true;

  document.getElementById('sort-stage-tag').textContent = `${stage.icon} ${stage.name}`;
  document.getElementById('sort-title').textContent     = sort.title;
  document.getElementById('sort-instruction').textContent = sort.instruction;
  document.getElementById('sort-col-a-label').textContent = sort.colA;
  document.getElementById('sort-col-b-label').textContent = sort.colB;

  // Clear zones
  document.getElementById('drop-a').innerHTML = '';
  document.getElementById('drop-b').innerHTML = '';
  document.getElementById('sort-feedback').className = 'feedback-banner hidden';

  // Populate pool
  const pool = document.getElementById('sort-pool');
  pool.innerHTML = '';
  const shuffled = [...sort.items].sort(() => Math.random() - 0.5);
  shuffled.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className    = 'sort-item';
    div.draggable    = true;
    div.dataset.id   = idx;
    div.dataset.bucket = item.bucket;
    div.textContent  = item.text;

    // Drag events
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', idx);
    });

    // Click to cycle: pool → col-A → col-B → pool (mobile-friendly)
    div.addEventListener('click', () => {
      Sound.click();
      const cur  = State.sortAssigned[idx];
      const next = cur === null ? 'a' : cur === 'a' ? 'b' : null;
      assignSortItem(div, idx, next);
    });

    pool.appendChild(div);
    State.sortAssigned[idx] = null;
  });

  // Re-assign sort items state
  State.sortAssigned = {};
  shuffled.forEach((_, idx) => State.sortAssigned[idx] = null);
  // Store items in order
  State.sortItems = shuffled;

  showScreen('sort');
}

function assignSortItem(div, id, bucket) {
  State.sortAssigned[id] = bucket;
  // Move visually
  const pool  = document.getElementById('sort-pool');
  const dropA = document.getElementById('drop-a');
  const dropB = document.getElementById('drop-b');
  if (bucket === 'a') { dropA.appendChild(div); }
  else if (bucket === 'b') { dropB.appendChild(div); }
  else { pool.appendChild(div); }
}

function onDrop(event, bucket) {
  event.preventDefault();
  const id  = parseInt(event.dataTransfer.getData('text/plain'), 10);
  const div = document.querySelector(`.sort-item[data-id="${id}"]`);
  if (div) {
    Sound.click();
    assignSortItem(div, id, bucket);
  }
  event.currentTarget.classList.remove('drag-over');
}

// Also handle drag events for visual feedback
document.addEventListener('DOMContentLoaded', () => {
  ['drop-a','drop-b'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  });
});

function checkSort() {
  Sound.click();
  const items   = State.sortItems || [];
  let correct   = 0;
  let incorrect = 0;

  items.forEach((item, idx) => {
    const assigned = State.sortAssigned[idx];
    const div = document.querySelector(`.sort-item[data-id="${idx}"]`);
    if (!div) return;
    if (assigned === item.bucket) {
      div.classList.add('correct');
      correct++;
    } else {
      div.classList.add('wrong');
      incorrect++;
    }
  });

  const feedback = document.getElementById('sort-feedback');
  const icon     = document.getElementById('sort-feedback-icon');
  const text     = document.getElementById('sort-feedback-text');
  document.getElementById('sort-submit').disabled = true;

  if (incorrect === 0) {
    Sound.correct();
    icon.textContent = '🎉';
    text.textContent = `Perfect! All ${correct} items correctly sorted! Brainstorming rules help teams generate more creative ideas!`;
    feedback.className = 'feedback-banner correct-bg';
    State.score += 150;
    State.xp    += 75;
    updateHUD();
    showToast('+150 pts • +75 XP 🌟');
    setTimeout(() => { showQuestion(); }, 3000);
  } else {
    Sound.wrong();
    icon.textContent = '🔄';
    text.textContent = `${correct} correct, ${incorrect} need fixing. Don\'t worry—now you know! Click "Check Answers" again after reviewing.`;
    feedback.className = 'feedback-banner wrong-bg';
    document.getElementById('sort-submit').disabled = false;
  }
}

/* ── Stage Complete ───────────────────────────────────────────────── */
function endStage() {
  Sound.stageComplete();
  Confetti.burst(100);

  const stage = State.currentStage;
  State.xp   += stage.xpReward;
  State.score += stage.xpReward;
  State.badgesEarned.push(stage.badge);
  updateHUD();

  document.getElementById('badge-earned').textContent = stage.badge;
  document.getElementById('stage-complete-msg').textContent = `You\'ve mastered ${stage.name}!`;
  document.getElementById('xp-gained').textContent = `+${stage.xpReward} XP`;

  // Stars (based on lives remaining)
  const starEl = document.getElementById('stars-earned');
  const starCount = State.lives >= 3 ? 3 : State.lives >= 2 ? 2 : 1;
  starEl.textContent = '⭐'.repeat(starCount);

  document.getElementById('insight-box').textContent = `💬 ${stage.insight}`;

  showScreen('stage-complete');
}

function nextStage() {
  Sound.click();
  Confetti.stop();
  State.stageIndex++;
  if (State.stageIndex >= STAGES.length) {
    showVictory();
  } else {
    updateHUD();
    showStageIntro();
  }
}

/* ── Victory ──────────────────────────────────────────────────────── */
function showVictory() {
  Sound.victory();
  Confetti.burst(200);
  document.getElementById('hud').classList.add('hidden');
  createStars('victory-stars', 60);

  document.getElementById('victory-char-name').textContent = `${State.char.avatar} ${State.char.name} — ${State.char.power}`;
  document.getElementById('final-score').textContent = State.score;
  document.getElementById('final-xp').textContent    = State.xp;
  document.getElementById('final-badge-count').textContent = State.badgesEarned.length;
  document.getElementById('badges-collected').textContent  = State.badgesEarned.join(' ');
  document.getElementById('cert-name').textContent = State.char.name;

  showScreen('victory');
}

/* ── Restart ──────────────────────────────────────────────────────── */
function restartGame() {
  Sound.click();
  Confetti.stop();
  State.reset();
  goToCharacter();
}

/* ── Init ─────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  createStars('stars', 80);
  syncSoundButtons();

  // Show title
  showScreen('title');

  // Expose globals for onclick attributes
  Object.assign(window, {
    goToTitle,
    goToCharacter,
    selectCharacter,
    toggleSound,
    startStage,
    nextStage,
    restartGame,
    checkSort,
    onDrop,
  });
});
