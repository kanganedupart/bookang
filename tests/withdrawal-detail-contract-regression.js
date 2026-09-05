"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const htmlPath = process.env.BOOKFLOW_HTML || path.join(__dirname, "..", "bookang.html");
const source = fs.readFileSync(htmlPath, "utf8");

function functionSource(name) {
  const patterns = [
    `async function ${name}(`,
    `function ${name}(`,
    `${name} = async function (`,
    `${name} = function (`,
  ];
  const start = patterns.map((pattern) => source.indexOf(pattern)).find((index) => index >= 0);
  assert.notEqual(start, undefined, `${name} 함수가 없습니다.`);
  const brace = source.indexOf("{", start);
  assert(brace >= 0, `${name} 함수 본문을 찾지 못했습니다.`);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} 함수 본문이 닫히지 않았습니다.`);
}

function contains(body, pattern, message) {
  assert.match(body, pattern, message);
}

const returnDecision = functionSource("setExitReturnDecision");
contains(returnDecision, /RETURNED/, "회수완료 결정을 저장하지 않습니다.");
contains(returnDecision, /RETAINED/, "보유유지 결정을 저장하지 않습니다.");
contains(returnDecision, /transaction\s*\(/, "회수 결정이 원자 transaction이 아닙니다.");
contains(returnDecision, /type\s*:\s*["']RETURN["']/, "회수 결정이 RETURN 원장을 만들지 않습니다.");
contains(returnDecision, /stockBefore/, "회수 원장에 재고 전 수량이 없습니다.");
contains(returnDecision, /stockAfter/, "회수 원장에 재고 후 수량이 없습니다.");
contains(returnDecision, /studentDeltas/, "회수 원장에 학생 보유수량 차감이 없습니다.");
contains(returnDecision, /pendingReturn\s*=\s*true/, "퇴반완료 전 배부 차단을 유지하지 않습니다.");
contains(returnDecision, /decision\s*===?\s*["']RETURNED["']|RETURNED["']\s*\)/,
  "이미 회수완료된 행의 중복 실행 차단 근거가 없습니다.");

const refundDecision = functionSource("setExitRefundDecision");
contains(refundDecision, /EXCLUDED/, "환불제외 상태가 없습니다.");
contains(refundDecision, /PENDING/, "환불유지 상태가 없습니다.");
contains(refundDecision, /transaction\s*\(/, "환불 결정이 원자 transaction이 아닙니다.");
assert.doesNotMatch(refundDecision, /\.stock\s*[+\-]?=/,
  "환불유지/제외 함수가 재고를 직접 변경합니다.");
assert.doesNotMatch(refundDecision, /\.holdings\s*[+\-]?=|holdings\s*\[[^\]]+\]\s*[+\-]?=/,
  "환불유지/제외 함수가 학생 보유수량을 직접 변경합니다.");
assert.doesNotMatch(refundDecision, /st\.movements\s*\[[^\]]+\]\s*=/,
  "환불유지/제외 함수가 배부·회수 원장을 생성합니다.");

const panel = functionSource("exitReviewPanel");
contains(panel, /setExitReturnDecision/, "퇴반 상세에 회수/유지 처리가 연결되지 않았습니다.");
contains(panel, /setExitRefundDecision/, "퇴반 상세에 환불유지/제외 처리가 연결되지 않았습니다.");
contains(panel, /completeRefund/, "퇴반 상세에 퇴반완료가 연결되지 않았습니다.");

const complete = functionSource("completeRefund");
contains(complete, /returnDecisions/, "퇴반완료가 보유교재 결정 완료 여부를 검사하지 않습니다.");
contains(complete, /RETAINED|RETURNED/, "퇴반완료가 회수/유지 결정을 검사하지 않습니다.");
contains(complete, /row\.decision\s*===\s*["']RETURNED["'][\s\S]*student\.holdings/, "회수 후 재배부된 교재의 완료 차단 근거가 없습니다.");
contains(complete, /EXCLUDED/, "퇴반완료가 환불제외 행을 구분하지 않습니다.");
contains(complete, /unitPrice/, "퇴반완료가 확정 단가를 스냅샷하지 않습니다.");
contains(complete, /refundAmount/, "퇴반완료가 행별 확정 환불금액을 저장하지 않습니다.");
contains(complete, /refundHistory/, "퇴반완료 이력을 생성하지 않습니다.");
contains(complete, /target\.status\s*=\s*["']DONE["']|status\s*:\s*["']DONE["']/,
  "퇴반완료 상태를 저장하지 않습니다.");
contains(complete, /target\.status\s*!==\s*["']PENDING["']|task\.status\s*!==\s*["']PENDING["']/,
  "퇴반완료 중복 실행 차단이 없습니다.");
assert.doesNotMatch(complete, /\.stock\s*[+\-]?=/,
  "퇴반완료 함수가 재고를 직접 변경합니다.");

const helper = spawnSync(process.execPath, [path.join(__dirname, "withdrawal-ledger-invariants.js")], {
  encoding: "utf8",
});
assert.equal(helper.status, 0, helper.stderr || helper.stdout || "원장 검증기 자체시험 실패");

process.stdout.write(JSON.stringify({
  ok: true,
  html: htmlPath,
  contracts: [
    "회수 exact-once 및 RETURN 원장",
    "보유유지 상태",
    "환불유지/제외 무재고변경",
    "퇴반완료 금액 snapshot",
    "퇴반완료 중복차단",
  ],
}, null, 2) + "\n");
