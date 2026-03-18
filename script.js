/**
 * Step Calculator — Extended Engine
 * Modes: Basic (PEMDAS parser) | Trig | Calculus
 */

// ─── Global State ─────────────────────────────────────────────────────────────
let expression    = '';
let justEvaluated = false;
let angleMode     = 'deg';   // 'deg' | 'rad'
let currentMode   = 'basic'; // 'basic' | 'trig' | 'calc'

// Calculus sub-state: collecting parameters
let calcState = null;
// calcState = { action: 'deriv'|'integral', fn: string, step: 'x'|'a'|'b'|'n', x, a, b }

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const exprEl    = document.getElementById('expression-display');
const resultEl  = document.getElementById('result-display');
const stepsEl   = document.getElementById('steps-display');
const angleTgl  = document.getElementById('angle-toggle');

// ─── Mode Tab Wiring ──────────────────────────────────────────────────────────
document.querySelectorAll('.mtab').forEach(tab => {
    tab.addEventListener('click', () => {
        currentMode = tab.dataset.mode;
        document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Show the right pad
        document.querySelectorAll('.keypad').forEach(p => p.classList.remove('active-pad'));
        const pad = document.getElementById('pad-' + currentMode);
        if (pad) pad.classList.add('active-pad');
        // Clear calc state when switching modes
        if (currentMode !== 'calc') {
            calcState = null;
            updateTopScreen();
        } else {
            initCalcState();
        }
    });
});

// ─── Formula Booklet ─────────────────────────────────────────────────────────
const overlay   = document.getElementById('booklet-overlay');
const bookletBtn = document.getElementById('booklet-btn');
const closeBtn  = document.getElementById('booklet-close');

bookletBtn.addEventListener('click', () => overlay.classList.add('open'));
closeBtn.addEventListener('click',   () => overlay.classList.remove('open'));
overlay.addEventListener('click',    e => { if (e.target === overlay) overlay.classList.remove('open'); });

// Booklet sub-tabs
document.querySelectorAll('.btab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.btab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.btab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

// ─── Button Delegation ───────────────────────────────────────────────────────
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => dispatch(btn));
});

function dispatch(btn) {
    const action = btn.dataset.action;
    if (!action) return;
    switch (action) {
        case 'clear':    handleClear();                break;
        case 'append':   handleAppend(btn.dataset.val); break;
        case 'evaluate': handleEvaluate();             break;
        case 'trig':     handleTrig(btn.dataset.fn);   break;
        case 'deriv':
        case 'integral': handleCalculus(action, btn.dataset.fn); break;
    }
}

// ─── Keyboard Support ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (overlay.classList.contains('open')) {
        if (e.key === 'Escape') overlay.classList.remove('open');
        return;
    }
    const map = {
        'Enter': 'eval', 'Escape': 'C', 'Backspace': 'back',
        '+': '+', '-': '-', '*': '*', '/': '/', '^': '^',
        '(': '(', ')': ')', '.': '.'
    };
    const v = map[e.key] || (e.key >= '0' && e.key <= '9' ? e.key : null);
    if (!v) return;
    if (v === 'C')    handleClear();
    else if (v === 'back') handleBack();
    else if (v === 'eval') handleEvaluate();
    else handleAppend(v);
});

// ─── Angle Toggle ─────────────────────────────────────────────────────────────
angleTgl.addEventListener('click', () => {
    angleMode = angleMode === 'deg' ? 'rad' : 'deg';
    angleTgl.textContent = angleMode.toUpperCase();
    angleTgl.classList.toggle('rad-mode', angleMode === 'rad');
});

// ─── Input Handlers ───────────────────────────────────────────────────────────
function handleClear() {
    expression = '';
    justEvaluated = false;
    calcState = null;
    exprEl.textContent = '';
    resultEl.textContent = '0';
    resultEl.classList.remove('error', 'pop');
    stepsEl.innerHTML = '<div class="step-placeholder">Steps will appear here...</div>';
    if (currentMode === 'calc') initCalcState();
}

function handleBack() {
    if (justEvaluated) { handleClear(); return; }
    expression = expression.slice(0, -1);
    updateTopScreen();
}

function handleAppend(val) {
    if (!val) return;

    // In calculus mode delegate number input to calculus param collection
    if (currentMode === 'calc' && calcState) {
        appendCalcParam(val);
        return;
    }

    // After an evaluated result, digit starts fresh but operator chains on
    if (justEvaluated && /[\d]/.test(val)) expression = '';
    justEvaluated = false;

    // Map π and e to values
    if (val === 'π') val = 'π';
    if (val === 'e') val = 'ℯ';

    const ops = ['+', '-', '*', '/', '^'];
    const last = expression.slice(-1);
    if (ops.includes(val) && ops.includes(last)) expression = expression.slice(0, -1);

    expression += val;
    updateTopScreen();
}

function handleTrig(fn) {
    if (justEvaluated) {
        // Apply trig to the result that's showing
        const x = parseFloat(resultEl.textContent);
        if (isNaN(x)) return;
        const { value, step } = applyTrigFn(fn, x);
        exprEl.textContent = `${fn}(${formatNum(x)})`;
        resultEl.textContent = formatNum(value);
        renderSteps([step], formatNum(value));
        pop(resultEl);
        expression = formatNum(value);
        justEvaluated = true;
    } else {
        // Wrap current expression in the function call notation
        expression += fn + '(';
        updateTopScreen();
    }
}

function handleEvaluate() {
    if (!expression) return;
    if (currentMode === 'calc' && calcState) {
        runCalcResult();
        return;
    }
    try {
        const { value, steps } = parseAndSolve(expression, true);
        exprEl.textContent = prettyExpr(expression) + '  =';
        resultEl.textContent = formatNum(value);
        resultEl.classList.remove('error');
        renderSteps(steps, formatNum(value));
        pop(resultEl);
        justEvaluated = true;
    } catch (err) {
        resultEl.textContent = 'Error';
        resultEl.classList.add('error');
        stepsEl.innerHTML = `<div class="step-placeholder">${err.message || 'Invalid expression'}</div>`;
    }
}

function updateTopScreen() {
    exprEl.textContent = prettyExpr(expression);
    try {
        const { value } = parseAndSolve(expression, false);
        resultEl.textContent = formatNum(value);
        resultEl.classList.remove('error');
    } catch { /* incomplete expression — no live preview */ }
}

// ─── Calculus State Machine ────────────────────────────────────────────────────
/**
 * Calculus is a multi-step input process:
 * Derivative: needs  x (the point)        => 1 param
 * Integral:   needs  a (lower), b (upper) => 2 params
 *
 * We collect inputs through the numpad and store them in calcState.
 */

function initCalcState() {
    calcState = { action: null, fn: null, step: null, buffer: '', x: null, a: null, b: null };
    promptCalc('Pick an operation above');
}

function handleCalculus(action, fn) {
    if (!calcState) calcState = { buffer: '' };
    calcState.action = action;
    calcState.fn = fn;
    calcState.buffer = '';
    calcState.x = null;
    calcState.a = null;
    calcState.b = null;

    if (action === 'deriv') {
        calcState.step = 'x';
        promptCalc(`d/dx [${fnLabel(fn)}]  —  enter x, then press =`);
    } else {
        calcState.step = 'a';
        promptCalc(`∫ ${fnLabel(fn)} dx  —  enter lower bound a, then press =`);
    }
    exprEl.textContent = '';
    resultEl.textContent = '…';
    resultEl.classList.remove('error');
    stepsEl.innerHTML = '<div class="step-placeholder">Waiting for input...</div>';
}

function appendCalcParam(val) {
    if (!calcState || !calcState.step) return;
    const ops = ['+', '-'];
    const last = calcState.buffer.slice(-1);
    if (ops.includes(val) && ops.includes(last)) {
        calcState.buffer = calcState.buffer.slice(0, -1);
    }
    calcState.buffer += val;
    exprEl.textContent = calcState.buffer;
    // Try live parse
    try {
        const v = evalSimple(calcState.buffer);
        resultEl.textContent = formatNum(v);
        resultEl.classList.remove('error');
    } catch { resultEl.textContent = calcState.buffer; }
}

function runCalcResult() {
    if (!calcState || !calcState.action) return;
    let v;
    try { v = evalSimple(calcState.buffer); } catch (e) {
        resultEl.textContent = 'Error';
        resultEl.classList.add('error');
        return;
    }

    if (calcState.action === 'deriv') {
        if (calcState.step === 'x') {
            calcState.x = v;
            calcState.buffer = '';
            const { value, steps } = numericalDerivative(calcState.fn, calcState.x);
            exprEl.textContent = `d/dx [${fnLabel(calcState.fn)}]  at x = ${formatNum(calcState.x)}`;
            resultEl.textContent = formatNum(value);
            resultEl.classList.remove('error');
            renderSteps(steps, formatNum(value));
            pop(resultEl);
            calcState.step = null;
            promptCalc('Result shown above. Pick another operation or press C.');
        }
    } else {
        // integral: collect a, b
        if (calcState.step === 'a') {
            calcState.a = v;
            calcState.buffer = '';
            calcState.step = 'b';
            promptCalc(`∫ ${fnLabel(calcState.fn)} dx  —  enter upper bound b, then press =`);
            resultEl.textContent = '…';
        } else if (calcState.step === 'b') {
            calcState.b = v;
            const { value, steps } = numericalIntegral(calcState.fn, calcState.a, calcState.b);
            exprEl.textContent = `∫ from ${formatNum(calcState.a)} to ${formatNum(calcState.b)}  [${fnLabel(calcState.fn)}]  dx`;
            resultEl.textContent = formatNum(value);
            resultEl.classList.remove('error');
            renderSteps(steps, formatNum(value));
            pop(resultEl);
            calcState.step = null;
            promptCalc('Result shown above. Pick another operation or press C.');
        }
    }
}

function promptCalc(msg) {
    stepsEl.innerHTML = `<div class="step-placeholder">${msg}</div>`;
}

// ─── Trig Function Application ───────────────────────────────────────────────
function applyTrigFn(fn, x) {
    const toRad = v => angleMode === 'deg' ? v * Math.PI / 180 : v;
    const toDeg = v => angleMode === 'deg' ? v * 180 / Math.PI : v;
    const r = toRad(x);

    let value, label, detail;
    switch (fn) {
        case 'sin':   value = Math.sin(r);   label = `sin(${formatNum(x)}${angleMode==='deg'?'°':''})`;  detail = `= ${formatNum(value)}`; break;
        case 'cos':   value = Math.cos(r);   label = `cos(${formatNum(x)}${angleMode==='deg'?'°':''})`;  detail = `= ${formatNum(value)}`; break;
        case 'tan':   value = Math.tan(r);   label = `tan(${formatNum(x)}${angleMode==='deg'?'°':''})`;  detail = `= ${formatNum(value)}`; break;
        case 'asin':  value = toDeg(Math.asin(x)); label = `arcsin(${formatNum(x)})`; detail = `= ${formatNum(value)}${angleMode==='deg'?'°':''}`; break;
        case 'acos':  value = toDeg(Math.acos(x)); label = `arccos(${formatNum(x)})`; detail = `= ${formatNum(value)}${angleMode==='deg'?'°':''}`; break;
        case 'atan':  value = toDeg(Math.atan(x)); label = `arctan(${formatNum(x)})`; detail = `= ${formatNum(value)}${angleMode==='deg'?'°':''}`; break;
        case 'sinh':  value = Math.sinh(x);  label = `sinh(${formatNum(x)})`;  detail = `= (e^x − e^−x)/2`; break;
        case 'cosh':  value = Math.cosh(x);  label = `cosh(${formatNum(x)})`;  detail = `= (e^x + e^−x)/2`; break;
        case 'tanh':  value = Math.tanh(x);  label = `tanh(${formatNum(x)})`;  detail = `= sinh/cosh`; break;
        case 'log':   value = Math.log10(x); label = `log₁₀(${formatNum(x)})`; detail = `= ${formatNum(value)}`; break;
        case 'ln':    value = Math.log(x);   label = `ln(${formatNum(x)})`;    detail = `= ${formatNum(value)}`; break;
        case 'sqrt':  value = Math.sqrt(x);  label = `√(${formatNum(x)})`;     detail = `= ${formatNum(value)}`; break;
        case 'pow2':  value = x * x;         label = `(${formatNum(x)})²`;     detail = `= ${formatNum(x)} × ${formatNum(x)}`; break;
        default: throw new Error(`Unknown function: ${fn}`);
    }
    return { value, step: { lhs: label, op: '→', rhs: formatNum(value) } };
}

// ─── Numerical Derivative  (central difference, h = 1e-7) ────────────────────
function numericalDerivative(fn, x) {
    const h = 1e-7;
    const fxph = evalFn(fn, x + h);
    const fxmh = evalFn(fn, x - h);
    const value = (fxph - fxmh) / (2 * h);
    const steps = [
        { lhs: `f(x) = ${fnLabel(fn)}`,                         op: '→', rhs: `x = ${formatNum(x)}` },
        { lhs: `f(x+h) − f(x−h)`,                              op: '→', rhs: `${formatNum(fxph)} − ${formatNum(fxmh)}` },
        { lhs: `[f(x+h) − f(x−h)] / 2h  (h=1e−7)`,            op: '→', rhs: formatNum(value) },
        { lhs: `d/dx [${fnLabel(fn)}] at x=${formatNum(x)}`,    op: '≈', rhs: formatNum(value) }
    ];
    return { value, steps };
}

// ─── Numerical Integral  (Simpson's 1/3 rule, n=1000 subdivisions) ────────────
function numericalIntegral(fn, a, b) {
    const n = 1000; // must be even
    const h = (b - a) / n;
    let sum = evalFn(fn, a) + evalFn(fn, b);
    let sumOdd = 0, sumEven = 0;
    for (let i = 1; i < n; i++) {
        const fx = evalFn(fn, a + i * h);
        if (i % 2 === 0) sumEven += fx; else sumOdd += fx;
    }
    sum += 4 * sumOdd + 2 * sumEven;
    const value = (h / 3) * sum;
    const fa = evalFn(fn, a), fb = evalFn(fn, b);
    const steps = [
        { lhs: `f(x) = ${fnLabel(fn)}`,                       op: '→', rhs: `[${formatNum(a)}, ${formatNum(b)}]` },
        { lhs: `f(a) = f(${formatNum(a)})`,                   op: '=',  rhs: formatNum(fa) },
        { lhs: `f(b) = f(${formatNum(b)})`,                   op: '=',  rhs: formatNum(fb) },
        { lhs: `Method: Simpson's 1/3  (n=${n})`,             op: '→', rhs: `h = ${formatNum(h)}` },
        { lhs: `∫ from ${formatNum(a)} to ${formatNum(b)}`,   op: '≈', rhs: formatNum(value) }
    ];
    return { value, steps };
}

// evaluates a named function at a point
function evalFn(fn, x) {
    switch (fn) {
        case 'sin':  return Math.sin(x);
        case 'cos':  return Math.cos(x);
        case 'tan':  return Math.tan(x);
        case 'ln':   return Math.log(x);
        case 'exp':  return Math.exp(x);
        case 'xn':   return x; // x^1 — user can interpret as x^n for any n
        default:     return x;
    }
}

function fnLabel(fn) {
    const map = { sin:'sin x', cos:'cos x', tan:'tan x', ln:'ln x', exp:'eˣ', xn:'xⁿ' };
    return map[fn] || fn;
}

// simple evaluator for the calculus number pad (no named functions, just arithmetic)
function evalSimple(src) {
    const { value } = parseAndSolve(src, false);
    return value;
}

// ─── Step Renderer ────────────────────────────────────────────────────────────
function renderSteps(steps, finalResult) {
    stepsEl.innerHTML = '';
    if (!steps || steps.length === 0) {
        const el = mkStep('Value', '→', finalResult, true);
        stepsEl.appendChild(el);
        return;
    }
    steps.forEach((s, i) => {
        const isLast = i === steps.length - 1;
        const el = mkStep(s.lhs, s.op || '→', s.rhs, isLast);
        el.style.animationDelay = `${i * 55}ms`;
        stepsEl.appendChild(el);
    });
    stepsEl.scrollTop = stepsEl.scrollHeight;
}

function mkStep(lhs, op, rhs, isFinal) {
    const div = document.createElement('div');
    div.className = 'step-item' + (isFinal ? ' final-step' : '');
    div.innerHTML = `
        <span class="step-lhs">${lhs}</span>
        <span class="step-eq">${op}</span>
        <span class="step-rhs">${rhs}</span>`;
    return div;
}

// ─── Recursive Descent Parser ─────────────────────────────────────────────────
//   expr   → term   (('+' | '-') term)*
//   term   → factor (('*' | '/' | '^') factor)*
//   factor → NUMBER | CONST | FN '(' expr ')' | '(' expr ')' | '-' factor

function parseAndSolve(src, rec) {
    const steps = [];
    const tokens = tokenize(src);
    let pos = 0;

    const peek    = ()  => tokens[pos];
    const consume = ()  => tokens[pos++];

    function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const right = parseTerm();
            if (rec) {
                const res = op === '+' ? left + right : left - right;
                steps.push({ lhs: `${fmt(left)} ${op} ${fmt(right)}`, op, rhs: fmt(res) });
            }
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    function parseTerm() {
        let left = parsePow();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
            const op = consume().value;
            const right = parsePow();
            if (rec) {
                const res = op === '*' ? left * right : left / right;
                steps.push({ lhs: `${fmt(left)} ${op === '*' ? '×' : '÷'} ${fmt(right)}`, op, rhs: fmt(res) });
            }
            left = op === '*' ? left * right : left / right;
        }
        return left;
    }

    function parsePow() {
        let base = parseFactor();
        if (peek() && peek().value === '^') {
            consume();
            const exp = parseFactor(); // right-associative
            const res = Math.pow(base, exp);
            if (rec) steps.push({ lhs: `${fmt(base)} ^ ${fmt(exp)}`, op: '→', rhs: fmt(res) });
            return res;
        }
        return base;
    }

    function parseFactor() {
        const t = peek();
        if (!t) throw new Error('Unexpected end');

        // Unary minus
        if (t.type === 'OP' && t.value === '-') { consume(); return -parseFactor(); }

        // Named functions
        if (t.type === 'FN') {
            const fn = consume().value;
            if (!peek() || peek().type !== 'LPAREN') throw new Error(`Expected ( after ${fn}`);
            consume(); // (
            const arg = parseExpr();
            if (!peek() || peek().type !== 'RPAREN') throw new Error('Missing )');
            consume(); // )
            const { value, step } = applyTrigFn(fn, arg);
            if (rec) steps.push(step);
            return value;
        }

        // Constants
        if (t.type === 'CONST') {
            consume();
            if (t.value === 'π') return Math.PI;
            if (t.value === 'ℯ') return Math.E;
        }

        // Sub-expression
        if (t.type === 'LPAREN') {
            consume();
            const v = parseExpr();
            if (!peek() || peek().type !== 'RPAREN') throw new Error('Missing )');
            consume();
            return v;
        }

        // Number
        if (t.type === 'NUM') { consume(); return t.value; }

        throw new Error(`Unexpected: ${t.value}`);
    }

    const value = parseExpr();
    if (pos < tokens.length) throw new Error('Unexpected tokens after expression');
    return { value, steps };
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────
const TRIG_FNS = ['asin','acos','atan','sinh','cosh','tanh','sin','cos','tan','log','ln','sqrt','pow2'];

function tokenize(src) {
    const tokens = [];
    let i = 0;
    src = src.trim();

    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }

        // Named functions (must check before single-char)
        let matched = false;
        for (const fn of TRIG_FNS) {
            if (src.startsWith(fn + '(', i)) {
                tokens.push({ type: 'FN', value: fn });
                i += fn.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // Constants
        if (ch === 'π' || ch === 'ℯ') {
            tokens.push({ type: 'CONST', value: ch });
            i++; continue;
        }

        // Number
        if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i+1]))) {
            let num = '';
            while (i < src.length && (/\d/.test(src[i]) || src[i] === '.')) num += src[i++];
            tokens.push({ type: 'NUM', value: parseFloat(num) });
            continue;
        }

        // Operators
        if (['+','-','*','/','^'].includes(ch)) { tokens.push({ type: 'OP', value: ch }); i++; continue; }
        if (ch === '(') { tokens.push({ type: 'LPAREN', value: ch }); i++; continue; }
        if (ch === ')') { tokens.push({ type: 'RPAREN', value: ch }); i++; continue; }

        throw new Error(`Unknown character: ${ch}`);
    }
    return tokens;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = formatNum;

function prettyExpr(str) {
    return str.replace(/\*/g, '×').replace(/\//g, '÷').replace(/ℯ/g, 'e').replace(/π/g, 'π');
}

function formatNum(n) {
    if (n === undefined || n === null) return '';
    if (!isFinite(n)) return n === Infinity ? '+∞' : (n === -Infinity ? '-∞' : 'NaN');
    const s = parseFloat(n.toPrecision(10)).toString();
    return s;
}

function pop(el) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 200);
}
