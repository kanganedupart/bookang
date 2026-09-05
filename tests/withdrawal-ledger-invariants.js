"use strict";

const assert = require("assert/strict");

const values = (record) => Object.values(record || {});
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function same(actual, expected, message) {
  assert.deepEqual(stable(actual), stable(expected), message);
}

function ledgerProjection(state) {
  return {
    stock: Object.fromEntries(values(state.books).map((book) => [book.id, Number(book.stock || 0)])),
    holdings: Object.fromEntries(values(state.students).map((student) => [student.id, clone(student.holdings || {})])),
    movements: clone(state.movements || {}),
    chargeTasks: clone(state.chargeTasks || {}),
    chargeHistory: clone(state.chargeHistory || {}),
  };
}

function assertNoLedgerChange(before, after, label) {
  same(ledgerProjection(after), ledgerProjection(before), `${label}: 재고·보유·원장·추가결제가 변했습니다.`);
}

function movementDelta(before, after) {
  const oldIds = new Set(Object.keys(before.movements || {}));
  return values(after.movements).filter((movement) => !oldIds.has(movement.id));
}

function assertReturnExactlyOnce(before, after, { studentId, bookId, quantity }) {
  const oldStock = Number(before.books?.[bookId]?.stock || 0);
  const newStock = Number(after.books?.[bookId]?.stock || 0);
  const oldHeld = Number(before.students?.[studentId]?.holdings?.[bookId] || 0);
  const newHeld = Number(after.students?.[studentId]?.holdings?.[bookId] || 0);
  assert.equal(newStock, oldStock + quantity, "회수 재고 증분이 정확하지 않습니다.");
  assert.equal(newHeld, oldHeld - quantity, "회수 학생보유 차감이 정확하지 않습니다.");
  const returns = movementDelta(before, after).filter((movement) =>
    movement.type === "RETURN" && movement.bookId === bookId &&
    Number(movement.studentDeltas?.[studentId] || 0) === -quantity,
  );
  assert.equal(returns.length, 1, "회수 원장은 정확히 한 건이어야 합니다.");
  assert.equal(Number(returns[0].quantity), quantity, "회수 원장 수량이 다릅니다.");
  assert.equal(
    Number(returns[0].stockAfter),
    Number(returns[0].stockBefore) + quantity,
    "회수 원장의 재고 전·후가 보존식을 위반했습니다.",
  );
}

function assertIdempotent(afterFirst, afterSecond, label) {
  same(afterSecond, afterFirst, `${label}: 두 번째 실행이 상태를 다시 변경했습니다.`);
}

function assertRefundCompletion(before, after, {
  taskId,
  expectedLines,
  expectedTotal,
}) {
  const task = after.refundTasks?.[taskId];
  assert(task, "퇴반대기 작업이 사라졌습니다.");
  assert.equal(task.status, "DONE", "퇴반대기가 완료 상태가 아닙니다.");
  assert.equal(Number(task.totalAmount), expectedTotal, "확정 환불금액이 다릅니다.");
  for (const expected of expectedLines) {
    const line = task.books?.[expected.bookId];
    assert(line, `환불 확정 교재가 없습니다: ${expected.bookId}`);
    assert.equal(line.status, expected.status, `${expected.bookId} 상태가 다릅니다.`);
    if (expected.status === "DONE") {
      assert.equal(Number(line.unitPrice), expected.unitPrice, `${expected.bookId} 확정 단가가 다릅니다.`);
      assert.equal(Number(line.quantity), expected.quantity, `${expected.bookId} 확정 수량이 다릅니다.`);
      assert.equal(Number(line.refundAmount), expected.unitPrice * expected.quantity, `${expected.bookId} 환불금액이 다릅니다.`);
    }
  }
  const histories = values(after.refundHistory).filter((row) => row.taskId === taskId && row.type === "퇴반완료");
  assert.equal(histories.length, 1, "퇴반완료 이력은 정확히 한 건이어야 합니다.");
  assert.equal(Number(histories[0].totalAmount), expectedTotal, "환불이력 금액이 작업 금액과 다릅니다.");
  same(after.books, before.books, "퇴반완료가 재고를 변경했습니다.");
  same(after.students?.[task.studentId]?.holdings, before.students?.[task.studentId]?.holdings,
    "퇴반완료가 학생 보유교재를 변경했습니다.");
  same(after.movements, before.movements, "퇴반완료가 배부·회수 원장을 변경했습니다.");
}

module.exports = {
  assertIdempotent,
  assertNoLedgerChange,
  assertRefundCompletion,
  assertReturnExactlyOnce,
  ledgerProjection,
  stable,
};

if (require.main === module) {
  const base = {
    books: { b1: { id: "b1", stock: 3 }, b2: { id: "b2", stock: 8 } },
    students: { s1: { id: "s1", holdings: { b1: 1 } } },
    movements: {}, chargeTasks: {}, chargeHistory: {}, refundTasks: {}, refundHistory: {},
  };
  assertNoLedgerChange(base, clone(base), "검증기 자체시험");
  const returned = clone(base);
  returned.books.b1.stock = 4;
  returned.students.s1.holdings.b1 = 0;
  returned.movements.r1 = {
    id: "r1", type: "RETURN", bookId: "b1", quantity: 1,
    stockBefore: 3, stockAfter: 4, studentDeltas: { s1: -1 },
  };
  assertReturnExactlyOnce(base, returned, { studentId: "s1", bookId: "b1", quantity: 1 });
  assertIdempotent(returned, clone(returned), "검증기 자체시험 중복처리");
  process.stdout.write("PASS withdrawal-ledger-invariants self-test\n");
}
