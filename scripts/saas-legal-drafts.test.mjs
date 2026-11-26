import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";

const names=[
  "PRIVACY-NOTICE-DRAFT.md",
  "DPA-DRAFT.md",
  "SAAS-TERMS-DRAFT.md",
];
const root="docs/saas/legal/";
for(const file of names){
  test(file+" is explicitly not approved and never asserts full compliance",()=>{
    const raw=readFileSync(root+file,"utf8");
    assert.ok(raw.length>1500,"Draft should contain actual content");
    assert.match(raw,/MINUTA/i);
    assert.match(raw,/(NÃO PUBLICAD|NÃO APROVAD|não assinado|não vigente)/i);
    assert.match(raw,/(PENDENTE|CONFIRMAR|VALIDAR|A DEFINIR)/i);
    assert.match(raw,/(LGPD|dados pessoais)/i);
    assert.doesNotMatch(raw,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_]+/);
  });
}
test("legal gate checklist declares legal and operational approval pending",()=>{
  const checklist=readFileSync(root+"REVIEW-GATES.md","utf8");
  assert.match(checklist,/L08.*PENDENTE/);
  assert.match(checklist,/revisão jurídica.*pendente/i);
  assert.match(checklist,/não.*aceite formal/i);
  assert.match(checklist,/R\$5/);
});
