"use strict";

const assert = require("assert/strict");
const {
  assertIdempotent,
  assertNoLedgerChange,
  assertRefundCompletion,
  assertReturnExactlyOnce,
  stable,
} = require("./withdrawal-ledger-invariants");

const clone = (value) => JSON.parse(JSON.stringify(value));
const values = (record) => Object.values(record || {});
const same = (actual, expected, message) => assert.deepEqual(stable(actual), stable(expected), message);

function refundIncluded(state, task, line) {
  return line.status === "PENDING" && line.source !== "RETURNED" &&
    !task.returnDecisions?.[line.bookId]?.decision &&
    Number(state.students[task.studentId].holdings?.[line.bookId] || 0) === 0;
}

function enroll(state, { studentId, name, periodId, classIds }) {
  assert(!state.students[studentId]);
  state.students[studentId] = {
    id: studentId, name, active: true, onboarding: true, holdings: {},
    periodMembership: { [periodId]: true },
    periodClasses: { [periodId]: Object.fromEntries(classIds.map((id) => [id, id])) },
  };
  state.students[studentId].onboarding = false;
}

function queueExit(state, { taskId, studentId, periodId, bookIds }) {
  assert(!state.refundTasks[taskId]);
  state.refundTasks[taskId] = {
    id: taskId, studentId, periodId, status: "PENDING", returnDecisions: {}, books: {},
  };
  for (const bookId of bookIds) {
    if (Number(state.students[studentId].holdings?.[bookId] || 0) === 0) {
      state.refundTasks[taskId].books[bookId] = {
        bookId, bookName: state.books[bookId].name, status: "PENDING", quantity: 1,
      };
    }
  }
}

function refundDecision(state, taskId, bookId, decision) {
  const task = state.refundTasks[taskId], line = task?.books?.[bookId];
  if (!task || task.status !== "PENDING" || !line || !["PENDING", "EXCLUDED"].includes(line.status)) return false;
  line.status = decision;
  if (decision === "EXCLUDED") line.excludeReason = "격리 검증";
  else delete line.excludeReason;
  task.reviewVersion = Number(task.reviewVersion || 0) + 1;
  return true;
}

function returnDecision(state, taskId, bookId, decision) {
  const task = state.refundTasks[taskId], student = state.students[task?.studentId], book = state.books[bookId];
  if (!task || task.status !== "PENDING" || !student || !book) return false;
  task.returnDecisions ||= {};
  const prior = task.returnDecisions[bookId]?.decision;
  if (prior === "RETURNED" || prior === decision) return false;
  const quantity = Number(student.holdings?.[bookId] || 0);
  if (quantity < 1) return false;
  if (decision === "RETURNED") {
    const operationId = `${task.id}|RETURN|${bookId}`;
    state.processedOperations ||= {};
    if (state.processedOperations[operationId]) return false;
    const stockBefore = Number(book.stock || 0);
    book.stock = stockBefore + quantity;
    student.holdings[bookId] = 0;
    const movementId = `M-${taskId}-${bookId}`;
    state.movements[movementId] = {
      id: movementId, operationId, type: "RETURN", mode: "EXIT_REVIEW",
      periodId: task.periodId, bookId, quantity, itemCount: quantity,
      stockBefore, stockAfter: book.stock,
      studentDeltas: { [student.id]: -quantity },
      periodStudentDeltas: { [task.periodId]: { [student.id]: -quantity } },
    };
    state.processedOperations[operationId] = { id: operationId };
    task.returnDecisions[bookId] = { bookId, quantity, decision, movementId };
  } else task.returnDecisions[bookId] = { bookId, quantity, decision };
  if (task.books?.[bookId]?.status === "PENDING") task.books[bookId].status = "EXCLUDED";
  task.reviewVersion = Number(task.reviewVersion || 0) + 1;
  student.pendingReturn = values(student.holdings).some((quantity) => Number(quantity) > 0);
  return true;
}

function complete(state, taskId) {
  const task = state.refundTasks[taskId], student = state.students[task?.studentId];
  if (!task || task.status !== "PENDING" || !student) return false;
  const holdings = Object.entries(student.holdings || {}).filter(([, quantity]) => Number(quantity) > 0);
  if (holdings.some(([bookId]) => !task.returnDecisions?.[bookId]?.decision)) return false;
  const lines = values(task.books).filter((line) => refundIncluded(state, task, line));
  const amounts = lines.map((line) => ({
    bookId: line.bookId, bookName: line.bookName, quantity: Number(line.quantity || 1),
    unitPrice: Number(state.books[line.bookId].price),
  })).map((line) => ({ ...line, amount: line.quantity * line.unitPrice }));
  for (const amount of amounts) Object.assign(task.books[amount.bookId], {
    status: "DONE", unitPrice: amount.unitPrice, quantity: amount.quantity, refundAmount: amount.amount,
  });
  task.status = "DONE";
  task.totalAmount = amounts.reduce((sum, line) => sum + line.amount, 0);
  student.periodMembership[task.periodId] = false;
  student.periodClasses[task.periodId] = {};
  student.active = false;
  student.pendingReturn = false;
  student.retainedBooksOnExit = values(task.returnDecisions).some((row) => row.decision === "RETAINED");
  const historyId = `RH-${taskId}`;
  state.refundHistory[historyId] = {
    id: historyId, taskId, type: "퇴반완료", totalAmount: task.totalAmount, bookAmounts: amounts,
  };
  return true;
}

const state = {
  books: {
    heldReturn: { id: "heldReturn", name: "회수책", stock: 3, price: 22000 },
    heldKeep: { id: "heldKeep", name: "보유책", stock: 7, price: 14000 },
    refundYes: { id: "refundYes", name: "환불책", stock: 10, price: 23000 },
    refundNo: { id: "refundNo", name: "환불제외책", stock: 10, price: 31000 },
  },
  students: {}, movements: {}, processedOperations: {}, refundTasks: {}, refundHistory: {},
  chargeTasks: {}, chargeHistory: {},
};

enroll(state, { studentId: "S1", name: "검증학생", periodId: "P3", classIds: ["C1", "C2"] });
same(Object.keys(state.students.S1.periodClasses.P3), ["C1", "C2"], "신규 반배정 exact-set 불일치");
state.students.S1.holdings = { heldReturn: 2, heldKeep: 1 };

queueExit(state, { taskId: "T1", studentId: "S1", periodId: "P3", bookIds: Object.keys(state.books) });
queueExit(state, { taskId: "T2", studentId: "S1", periodId: "P3", bookIds: ["refundNo"] });
same(Object.keys(state.refundTasks), ["T1", "T2"], "같은 학생·기간 복수 task exact-set 불일치");
same(Object.keys(state.refundTasks.T1.books).sort(), ["refundNo", "refundYes"], "퇴반등록 환불후보 exact-set 불일치");

const beforeRefundChoice = clone(state);
assert(refundDecision(state, "T1", "refundNo", "EXCLUDED"));
assertNoLedgerChange(beforeRefundChoice, state, "환불 제외");
assert.equal(state.refundTasks.T2.books.refundNo.status, "PENDING", "taskId 격리가 깨졌습니다.");

const beforeKeep = clone(state);
assert(returnDecision(state, "T1", "heldKeep", "RETAINED"));
assertNoLedgerChange(beforeKeep, state, "보유 유지");

const beforeReturn = clone(state);
assert(returnDecision(state, "T1", "heldReturn", "RETURNED"));
assertReturnExactlyOnce(beforeReturn, state, { studentId: "S1", bookId: "heldReturn", quantity: 2 });
const afterReturn = clone(state);
assert.equal(returnDecision(state, "T1", "heldReturn", "RETURNED"), false, "회수 중복 클릭이 허용됐습니다.");
assertIdempotent(afterReturn, state, "회수 중복 클릭");

const beforeComplete = clone(state);
assert(complete(state, "T1"), "퇴반완료가 실패했습니다.");
assertRefundCompletion(beforeComplete, state, {
  taskId: "T1", expectedTotal: 23000,
  expectedLines: [
    { bookId: "refundYes", status: "DONE", unitPrice: 23000, quantity: 1 },
    { bookId: "refundNo", status: "EXCLUDED" },
  ],
});
assert.equal(state.students.S1.holdings.heldKeep, 1, "보유 유지 교재가 변경됐습니다.");
assert.equal(state.students.S1.retainedBooksOnExit, true, "보유 유지 표지가 없습니다.");
assert.equal(state.students.S1.pendingReturn, false, "퇴반완료 후 pendingReturn이 남았습니다.");
assert.equal(state.refundTasks.T2.status, "PENDING", "다른 task가 함께 완료됐습니다.");

const afterComplete = clone(state);
assert.equal(complete(state, "T1"), false, "퇴반완료 중복 클릭이 허용됐습니다.");
assertIdempotent(afterComplete, state, "퇴반완료 중복 클릭");
assert.equal(values(state.refundHistory).filter((row) => row.taskId === "T1").length, 1,
  "퇴반완료 이력이 중복 생성됐습니다.");

process.stdout.write(JSON.stringify({
  ok: true,
  exactSets: {
    tasks: Object.keys(state.refundTasks),
    t1RefundDone: values(state.refundTasks.T1.books).filter((line) => line.status === "DONE").map((line) => line.bookId),
    t1RefundExcluded: values(state.refundTasks.T1.books).filter((line) => line.status === "EXCLUDED").map((line) => line.bookId),
    movements: Object.keys(state.movements),
    refundHistory: Object.keys(state.refundHistory),
  },
  stock: Object.fromEntries(values(state.books).map((book) => [book.id, book.stock])),
  holdings: state.students.S1.holdings,
}, null, 2) + "\n");
