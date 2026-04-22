/**
 * Incremental extraction of the `reply` string from a streaming JSON object.
 * Not a full JSON parser — only the `reply` value is decoded and emitted.
 * If the first non-whitespace character is not `{`, each chunk is emitted as plain text.
 */

export type StreamingReplyExtractorState = "seeking" | "inside" | "done" | "plain_text";

export type FeedResult = { deltaText: string; finished: boolean };

export type StreamingReplyExtractor = {
  feed(chunk: string): FeedResult;
  state(): StreamingReplyExtractorState;
};

const WS = new Set([" ", "\n", "\r", "\t"]);
function isWs(c: string): boolean {
  return WS.has(c);
}
function firstNonWs(s: string): number {
  for (let k = 0; k < s.length; k++) {
    if (!isWs(s[k]!)) return k;
  }
  return -1;
}
function isHex1(x: string): boolean {
  return (x >= "0" && x <= "9") || (x >= "a" && x <= "f") || (x >= "A" && x <= "F");
}
function isHex4(h: string): boolean {
  return h.length === 4 && isHex1(h[0]!) && isHex1(h[1]!) && isHex1(h[2]!) && isHex1(h[3]!);
}

/**
 * `at` = next read index, or null after close. `uAcc` = hex digits for unfinished `\u`.
 * `inU` = true while collecting 4 hex digits. `pairHi` = high surrogate before low `\uXXXX`.
 */
export type StringReadState = {
  at: number | null;
  inU: boolean;
  uAcc: string;
  pairHi: number | null;
  pendingBackslash: boolean;
};

function freshStringReadState(): StringReadState {
  return { at: null, inU: false, uAcc: "", pairHi: null, pendingBackslash: false };
}

/** One JSON character after a backslash (not `u`). Returns false if the escape is invalid. */
function tryEmitBackslashCharEscape(
  n: string,
  push: (c: string) => void,
): boolean {
  switch (n) {
    case '"':
      push('"');
      return true;
    case "\\":
      push("\\");
      return true;
    case "/":
      push("/");
      return true;
    case "b":
      push("\b");
      return true;
    case "f":
      push("\f");
      return true;
    case "n":
      push("\n");
      return true;
    case "r":
      push("\r");
      return true;
    case "t":
      push("\t");
      return true;
    default:
      return false;
  }
}

function readJsonString(
  s: string,
  openIndex: number,
  r: StringReadState,
  out: null | { buf: string },
  emit: ((x: string) => void) | null,
): { end: number } | { more: true } {
  if (openIndex >= s.length || s[openIndex] !== '"') return { more: true };
  const push = (c: string) => {
    if (out) out.buf += c;
    else if (emit) emit(c);
  };
  let j = openIndex + 1;
  for (;;) {
    if (r.at != null) {
      j = r.at;
    }
    if (r.pendingBackslash) {
      if (j + 1 >= s.length) {
        r.at = j;
        return { more: true };
      }
      const n = s[j + 1]!;
      r.pendingBackslash = false;
      if (n === "u") {
        r.inU = true;
        r.uAcc = "";
        j += 2;
        r.at = j;
        continue;
      }
      j += 2;
      r.at = j;
      if (tryEmitBackslashCharEscape(n, push)) continue;
      return { more: true };
    }
    if (r.inU) {
      while (r.uAcc.length < 4) {
        if (j >= s.length) {
          r.at = j;
          return { more: true };
        }
        const ch2 = s[j]!;
        if (!isHex1(ch2)) return { more: true };
        r.uAcc += ch2;
        j++;
      }
      if (!isHex4(r.uAcc)) return { more: true };
      const v = parseInt(r.uAcc, 16);
      r.inU = false;
      r.uAcc = "";
      r.at = j;
      if (r.pairHi != null) {
        const lo = v;
        if (lo < 0xdc00 || lo > 0xdfff) return { more: true };
        const hi = r.pairHi;
        r.pairHi = null;
        push(String.fromCodePoint(0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00)));
        continue;
      }
      if (v >= 0xd800 && v <= 0xdbff) {
        r.pairHi = v;
        continue;
      }
      push(String.fromCharCode(v));
      continue;
    }
    if (r.pairHi != null) {
      if (j >= s.length) {
        r.at = j;
        return { more: true };
      }
      if (s[j] !== "\\" || j + 1 >= s.length || s[j + 1] !== "u") {
        r.at = j;
        return { more: true };
      }
      r.inU = true;
      r.uAcc = "";
      j += 2;
      r.at = j;
      continue;
    }
    if (j >= s.length) {
      r.at = j;
      return { more: true };
    }
    const c = s[j]!;
    if (c === '"') {
      r.at = null;
      r.inU = false;
      r.uAcc = "";
      r.pairHi = null;
      r.pendingBackslash = false;
      return { end: j + 1 };
    }
    if (c === "\\") {
      if (j + 1 >= s.length) {
        r.pendingBackslash = true;
        r.at = j;
        return { more: true };
      }
      const n = s[j + 1]!;
      if (n === "u") {
        r.inU = true;
        r.uAcc = "";
        j += 2;
        r.at = j;
        continue;
      }
      j += 2;
      r.at = j;
      if (tryEmitBackslashCharEscape(n, push)) continue;
      return { more: true };
    }
    if (c < " " && c !== "\t") {
      return { more: true };
    }
    push(c);
    j++;
    r.at = j;
  }
}

function skipNumber(s: string, j: number): { end: number } | { more: true } {
  let k = j;
  if (k < s.length && s[k] === "-") k++;
  if (k >= s.length) return { more: true };
  if (s[k] === "0" && k + 1 < s.length && s[k + 1]! >= "0" && s[k + 1]! <= "9") {
    return { more: true };
  }
  while (k < s.length && s[k]! >= "0" && s[k]! <= "9") k++;
  if (k < s.length && s[k] === ".") {
    k++;
    if (k >= s.length) return { more: true };
    if (!(s[k]! >= "0" && s[k]! <= "9")) return { more: true };
    while (k < s.length && s[k]! >= "0" && s[k]! <= "9") k++;
  }
  if (k < s.length && (s[k] === "e" || s[k] === "E")) {
    k++;
    if (k < s.length && (s[k] === "+" || s[k] === "-")) k++;
    const startDig = k;
    while (k < s.length && s[k]! >= "0" && s[k]! <= "9") k++;
    if (k === startDig) return { more: true };
  }
  return { end: k };
}

const stackO = "O" as const;
const stackA = "A" as const;
type St = typeof stackO | typeof stackA;

/**
 * `s[from]` is `{` or `[` — return index after the matching `}` or `]`.
 * The outer open bracket is closed when `stack` is empty and we see the matching close.
 */
function walkBalanced(
  s: string,
  from: number,
  open: "{" | "[",
): { end: number } | { more: true } {
  if (s[from] !== open) return { more: true };
  const stack: St[] = [];
  let j = from + 1;
  for (;;) {
    if (j >= s.length) return { more: true };
    while (j < s.length && isWs(s[j]!)) j++;
    if (j >= s.length) return { more: true };
    const c0 = s[j]!;
    if (c0 === "}") {
      if (stack.length > 0) {
        if (stack[stack.length - 1] !== stackO) return { more: true };
        stack.pop()!;
        j++;
        continue;
      }
      if (open !== "{") return { more: true };
      j++;
      return { end: j };
    }
    if (c0 === "]") {
      if (stack.length > 0) {
        if (stack[stack.length - 1] !== stackA) return { more: true };
        stack.pop()!;
        j++;
        continue;
      }
      if (open !== "[") return { more: true };
      j++;
      return { end: j };
    }
    if (c0 === '"') {
      const rs = freshStringReadState();
      const e = readJsonString(s, j, rs, { buf: "" }, null);
      if ("more" in e) return e;
      j = e.end;
      continue;
    }
    if (c0 === "{") {
      stack.push(stackO);
      j++;
      continue;
    }
    if (c0 === "[") {
      stack.push(stackA);
      j++;
      continue;
    }
    if (c0 === "t" && s.slice(j, j + 4) === "true") {
      j += 4;
      continue;
    }
    if (c0 === "f" && s.length >= j + 5 && s.slice(j, j + 5) === "false") {
      j += 5;
      continue;
    }
    if (c0 === "n" && s.length >= j + 4 && s.slice(j, j + 4) === "null") {
      j += 4;
      continue;
    }
    if (c0 === "-" || (c0 >= "0" && c0 <= "9")) {
      const sn = skipNumber(s, j);
      if ("more" in sn) return sn;
      j = sn.end;
      continue;
    }
    if (c0 === "," || c0 === ":") {
      j++;
      continue;
    }
    return { more: true };
  }
}

function skipJsonValue(
  s: string,
  from: number,
): { end: number } | { more: true } {
  let j = from;
  while (j < s.length && isWs(s[j]!)) j++;
  if (j >= s.length) return { more: true };
  const c0 = s[j]!;
  if (c0 === '"') {
    return readJsonString(s, j, freshStringReadState(), { buf: "" }, null);
  }
  if (c0 === "t" && s.slice(j, j + 4) === "true") return { end: j + 4 };
  if (c0 === "f" && s.length >= j + 5 && s.slice(j, j + 5) === "false") return { end: j + 5 };
  if (c0 === "n" && s.length >= j + 4 && s.slice(j, j + 4) === "null") return { end: j + 4 };
  if (c0 === "{" || c0 === "[") {
    return walkBalanced(s, j, c0);
  }
  if (c0 === "-" || (c0 >= "0" && c0 <= "9")) {
    return skipNumber(s, j);
  }
  return { more: true };
}

type Phase =
  | { k: "field" }
  | { k: "key"; oq: number; st: StringReadState; acc: { buf: string } }
  | { k: "colon"; key: string }
  | { k: "val"; from: number }
  | { k: "reply"; openQuote: number; st: StringReadState }
  | { k: "done" };

export function createReplyExtractor(): StreamingReplyExtractor {
  let buffer = "";
  let root: "pending" | "plain" | "json" = "pending";
  let pos = 0;
  let phase: Phase = { k: "field" };
  let locked = false;
  /** Set after the root `{` of the object has been moved past. */
  let sawRootBrace = false;

  const state = (): StreamingReplyExtractorState => {
    if (root === "pending") return "seeking";
    if (root === "plain") return "plain_text";
    if (root === "json" && phase.k === "done") return "done";
    if (root === "json" && phase.k === "reply") return "inside";
    return "seeking";
  };

  const feed = (chunk: string): FeedResult => {
    if (root === "plain") {
      return { deltaText: String(chunk), finished: false };
    }
    if (root === "json" && phase.k === "done" && locked) {
      return { deltaText: "", finished: true };
    }
    buffer += String(chunk);
    if (root === "pending") {
      const t = firstNonWs(buffer);
      if (t < 0) return { deltaText: "", finished: false };
      if (buffer[t]! !== "{") {
        root = "plain";
        const all = buffer;
        buffer = "";
        pos = 0;
        return { deltaText: all, finished: false };
      }
      root = "json";
      pos = t;
      sawRootBrace = false;
      phase = { k: "field" };
    }
    return run();
  };

  const run = (): FeedResult => {
    const out: string[] = [];
    const d = (x: string) => {
      if (x) out.push(x);
    };
    const bu = buffer;
    let i = pos;
    if (phase.k === "val") {
      i = phase.from;
    }

    for (;;) {
      if (phase.k === "done" && locked) {
        pos = i;
        return { deltaText: out.join(""), finished: true };
      }
      if (phase.k === "field") {
        while (i < bu.length && isWs(bu[i]!)) i++;
        if (i >= bu.length) {
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        if (!sawRootBrace && bu[i] === "{") {
          sawRootBrace = true;
          i++;
          continue;
        }
        if (bu[i] === ",") {
          i++;
          continue;
        }
        if (bu[i] === "}") {
          phase = { k: "done" };
          locked = true;
          pos = i + 1;
          return { deltaText: out.join(""), finished: true };
        }
        if (bu[i] !== '"') {
          phase = { k: "done" };
          locked = true;
          pos = i;
          return { deltaText: out.join(""), finished: true };
        }
        phase = { k: "key", oq: i, st: freshStringReadState(), acc: { buf: "" } };
        continue;
      }
      if (phase.k === "key") {
        const e = readJsonString(bu, phase.oq, phase.st, phase.acc, null);
        if ("more" in e) {
          pos = phase.oq;
          return { deltaText: out.join(""), finished: false };
        }
        i = e.end;
        const key = phase.acc.buf;
        while (i < bu.length && isWs(bu[i]!)) i++;
        if (i >= bu.length) {
          phase = { k: "colon", key };
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        if (bu[i] !== ":") {
          phase = { k: "done" };
          locked = true;
          pos = i;
          return { deltaText: out.join(""), finished: true };
        }
        i++;
        while (i < bu.length && isWs(bu[i]!)) i++;
        if (i >= bu.length) {
          phase = { k: "val", from: i };
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        if (key === "reply" && bu[i] === '"') {
          phase = { k: "reply", openQuote: i, st: freshStringReadState() };
          continue;
        }
        const skv = skipJsonValue(bu, i);
        if ("more" in skv) {
          phase = { k: "val", from: i };
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        i = skv.end;
        phase = { k: "field" };
        continue;
      }
      if (phase.k === "colon") {
        const { key } = phase;
        while (i < bu.length && isWs(bu[i]!)) i++;
        if (i >= bu.length) {
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        if (key === "reply" && bu[i] === '"') {
          phase = { k: "reply", openQuote: i, st: freshStringReadState() };
          continue;
        }
        const sk2 = skipJsonValue(bu, i);
        if ("more" in sk2) {
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        i = sk2.end;
        phase = { k: "field" };
        continue;
      }
      if (phase.k === "val") {
        const sk3 = skipJsonValue(bu, i);
        if ("more" in sk3) {
          pos = i;
          return { deltaText: out.join(""), finished: false };
        }
        i = sk3.end;
        phase = { k: "field" };
        continue;
      }
      if (phase.k === "reply") {
        const re = readJsonString(
          bu,
          phase.openQuote,
          phase.st,
          null,
          (t) => d(t),
        );
        if ("more" in re) {
          pos = phase.openQuote;
          return { deltaText: out.join(""), finished: false };
        }
        i = re.end;
        phase = { k: "done" };
        locked = true;
        pos = i;
        return { deltaText: out.join(""), finished: true };
      }
    }
  };

  return { feed, state };
}
