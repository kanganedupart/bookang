// Consistency guards for the scoped audit writer. Existing authorization is unchanged.
// Only live server-timestamped V1 commits opt in; historical restores and existing
// full-root workflows keep their original semantics. This is not an auth boundary.
const dataset = 'bookflowOperational20260904V1';
function buildRules(original) {
  const result = structuredClone(original), base = result.rules[dataset];
  if (!base || Object.keys(base).some(k => !['.read', '.write'].includes(k)))
    throw new Error('Unexpected rules: review before merging');
  function guard(location) {
    const recent = location === 'recent';
    const nextRoot = recent ? 'newData.parent().parent().parent()' : 'newData.parent().parent()';
    const bid = "newData.child('bookId').val()";
    const oldBook = `root.child('${dataset}/books').child(${bid})`;
    const nextBook = `${nextRoot}.child('books').child(${bid})`;
    const other = recent ? `${nextRoot}.child('audits').child(newData.child('id').val())` : `${nextBook}.child('audit')`;
    const checks = [
      recent ? `${bid} === $bid` : "newData.child('id').val() === $aid",
      `${oldBook}.exists()`,
      `(!${oldBook}.child('periodIds').exists() || (${oldBook}.child('periodIds').child(newData.child('periodId').val()).exists() && ${oldBook}.child('periodIds').child(newData.child('periodId').val()).val() !== false))`,
      "newData.child('physical').isNumber() && newData.child('physical').val() >= 0 && newData.child('physical').val() % 1 === 0",
      "newData.child('memo').isString() && newData.child('memo').val().length > 0",
      `newData.child('system').val() === (${oldBook}.child('stock').exists() ? ${oldBook}.child('stock').val() : 0)`,
      "newData.child('diff').val() === newData.child('physical').val() - newData.child('system').val()",
      `newData.child('previousAuditId').val() === (${oldBook}.child('audit/id').exists() ? ${oldBook}.child('audit/id').val() : '')`,
      `(${nextRoot}.child('periods').child(newData.child('periodId').val()).child('status').val() === 'ACTIVE' || ${nextRoot}.child('periods').child(newData.child('periodId').val()).child('status').val() === 'CLOSING')`,
      ...['id','bookId','periodId','physical','system','diff','memo','actor','time','saveProtocol','validatedAt','previousAuditId'].map(k => `newData.child('${k}').val() === ${other}.child('${k}').val()`),
    ];
    const existing = recent ? "newData.child('id').val() === data.child('id').val()" : 'data.exists()';
    return `${existing} || newData.child('saveProtocol').val() !== 'SCOPED_AUDIT_V1' || newData.child('validatedAt').val() !== now || (${checks.join(' && ')})`;
  }
  base.books = {$bid: {audit: {'.validate': guard('recent')}}};
  base.audits = {$aid: {'.validate': guard('history')}};
  return result;
}
module.exports = {buildRules, dataset};
