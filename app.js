const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const historyListEl = document.getElementById("historyList");

const MAX_EXPR_LEN = 240;
const HISTORY_KEY = "calculator.history.v1";
const HISTORY_LIMIT = 20;

let expression = "";
let lastResult = 0;

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setExpression(next) {
  expression = next.slice(0, MAX_EXPR_LEN);
  expressionEl.textContent = expression;
  setStatus("");
  preview();
}

function setResult(value, { isError = false } = {}) {
  resultEl.textContent = isError ? String(value) : formatNumber(value);
  resultEl.classList.toggle("error", Boolean(isError));
}

function formatNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) return n.toExponential(10).replace(/\.?0+e/, "e");
  return String(+n.toPrecision(12)).replace(/\.0+$/, "");
}

function isOperator(ch) {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/";
}

function preview() {
  if (!expression.trim()) {
    setResult(0);
    return;
  }
  try {
    const value = evaluate(expression);
    lastResult = value;
    setResult(value);
  } catch (e) {
    // Show prior result; keep UX quiet unless equals pressed
    setResult(lastResult);
  }
}

function appendValue(v) {
  if (!v) return;
  if (expression.length >= MAX_EXPR_LEN) return;

  const last = expression.slice(-1);

  // Normalize operators spacing-less; avoid duplicate operators (except leading minus).
  if (isOperator(v)) {
    if (!expression && v !== "-") return;
    if (isOperator(last)) {
      setExpression(expression.slice(0, -1) + v);
      return;
    }
  }

  // Decimal: avoid two decimals in the current number segment.
  if (v === ".") {
    const seg = expression.split(/[\+\-\*\/\(\)]/).pop() || "";
    if (seg.includes(".")) return;
    if (!seg) {
      setExpression(expression + "0.");
      return;
    }
  }

  // Implicit multiplication: `2(` -> `2*(`, `)(` -> `)*(`, `)2` -> `)*2`
  if (v === "(") {
    if (last && (/\d/.test(last) || last === ")")) setExpression(expression + "*(");
    else setExpression(expression + "(");
    return;
  }
  if (/\d/.test(v)) {
    if (last === ")") setExpression(expression + "*" + v);
    else setExpression(expression + v);
    return;
  }

  setExpression(expression + v);
}

function clearAll() {
  expression = "";
  expressionEl.textContent = "";
  lastResult = 0;
  setResult(0);
  setStatus("");
}

function backspace() {
  if (!expression) return;
  setExpression(expression.slice(0, -1));
}

function toggleSign() {
  // Toggle sign for the last number token in the expression.
  const m = expression.match(/(.*?)(-?\d+(\.\d+)?)(?!.*\d)/);
  if (!m) {
    // If expression is empty, start with "-".
    if (!expression) setExpression("-");
    return;
  }
  const before = m[1];
  const num = m[2];
  const toggled = num.startsWith("-") ? num.slice(1) : "-" + num;
  setExpression(before + toggled);
}

function equals() {
  if (!expression.trim()) return;
  try {
    const value = evaluate(expression);
    addHistory(expression, value);
    setExpression(String(value));
    setStatus("Saved to history");
  } catch (e) {
    setResult("Error", { isError: true });
    setStatus(e instanceof Error ? e.message : "Invalid expression");
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function renderHistory() {
  const items = loadHistory();
  historyListEl.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "historyItem";
    li.tabIndex = 0;

    const left = document.createElement("div");
    left.className = "historyExpr";
    left.textContent = item.expr;

    const right = document.createElement("div");
    right.className = "historyRes";
    right.textContent = formatNumber(item.result);

    li.append(left, right);
    li.addEventListener("click", () => setExpression(String(item.expr)));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpression(String(item.expr));
      }
    });
    historyListEl.appendChild(li);
  }
}

function addHistory(expr, result) {
  const items = loadHistory();
  items.unshift({ expr, result, ts: Date.now() });
  saveHistory(items);
  renderHistory();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  setStatus("History cleared");
}

// --- Safe expression evaluation (no eval) ---
// Supports: numbers, + - * /, parentheses, unary +/-.

function tokenize(input) {
  const s = input.replace(/\s+/g, "");
  const tokens = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if (!/^\d*\.?\d+$/.test(raw)) throw new Error("Invalid number");
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error("Number too large");
      tokens.push({ type: "num", value: n });
      i = j;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: ch });
      i++;
      continue;
    }
    if (isOperator(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }

  return tokens;
}

function toRpn(tokens) {
  const out = [];
  const ops = [];

  const prec = { "u+": 3, "u-": 3, "*": 2, "/": 2, "+": 1, "-": 1 };
  const rightAssoc = new Set(["u+", "u-"]);

  function pushOp(op) {
    while (ops.length) {
      const top = ops[ops.length - 1];
      if (top.type !== "op") break;
      const a = op.value;
      const b = top.value;
      if (
        (rightAssoc.has(a) && prec[a] < prec[b]) ||
        (!rightAssoc.has(a) && prec[a] <= prec[b])
      ) {
        out.push(ops.pop());
        continue;
      }
      break;
    }
    ops.push(op);
  }

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type === "num") {
      out.push(t);
      continue;
    }
    if (t.type === "(") {
      ops.push(t);
      continue;
    }
    if (t.type === ")") {
      while (ops.length && ops[ops.length - 1].type !== "(") out.push(ops.pop());
      if (!ops.length) throw new Error("Mismatched parentheses");
      ops.pop(); // remove "("
      continue;
    }
    if (t.type === "op") {
      // Unary detection: operator at start or after another operator or "("
      const prev = tokens[idx - 1];
      const unary = !prev || prev.type === "op" || prev.type === "(";
      if (unary && (t.value === "+" || t.value === "-")) {
        pushOp({ type: "op", value: t.value === "+" ? "u+" : "u-" });
      } else {
        pushOp(t);
      }
      continue;
    }
    throw new Error("Invalid token");
  }

  while (ops.length) {
    const t = ops.pop();
    if (t.type === "(") throw new Error("Mismatched parentheses");
    out.push(t);
  }

  return out;
}

function evalRpn(rpn) {
  const st = [];
  for (const t of rpn) {
    if (t.type === "num") {
      st.push(t.value);
      continue;
    }
    if (t.type === "op") {
      if (t.value === "u+" || t.value === "u-") {
        if (st.length < 1) throw new Error("Invalid expression");
        const a = st.pop();
        st.push(t.value === "u-" ? -a : +a);
        continue;
      }
      if (st.length < 2) throw new Error("Invalid expression");
      const b = st.pop();
      const a = st.pop();
      let v;
      switch (t.value) {
        case "+":
          v = a + b;
          break;
        case "-":
          v = a - b;
          break;
        case "*":
          v = a * b;
          break;
        case "/":
          if (b === 0) throw new Error("Division by zero");
          v = a / b;
          break;
        default:
          throw new Error("Unknown operator");
      }
      if (!Number.isFinite(v)) throw new Error("Result not finite");
      st.push(v);
      continue;
    }
    throw new Error("Invalid token");
  }
  if (st.length !== 1) throw new Error("Invalid expression");
  return st[0];
}

function evaluate(input) {
  const tokens = tokenize(input);
  if (!tokens.length) return 0;
  const rpn = toRpn(tokens);
  return evalRpn(rpn);
}

// --- UI wiring ---

document.querySelector(".keys").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;
  const value = btn.dataset.value;
  if (action === "clear") return clearAll();
  if (action === "backspace") return backspace();
  if (action === "toggleSign") return toggleSign();
  if (action === "equals") return equals();
  if (value) return appendValue(value);
});

document.querySelector(".history").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.action === "clearHistory") clearHistory();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return clearAll();
  if (e.key === "Backspace") return backspace();
  if (e.key === "Enter" || e.key === "=") {
    e.preventDefault();
    return equals();
  }
  if (e.key === "(" || e.key === ")") return appendValue(e.key);
  if (e.key === "." || /\d/.test(e.key)) return appendValue(e.key);
  if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") return appendValue(e.key);
});

renderHistory();
preview();

