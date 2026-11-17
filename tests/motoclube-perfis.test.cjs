const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function fixture(status='membro') {
  const store=new Map([
    ['motoclubes/a',{responsavelUserId:'admin',membrosIds:['user']}],
    ['usuarios/user',{nomeCompleto:'Ana',fotoUrl:'https://example.test/photo',cidade:'São Paulo',email:'private@example.test',telefone:'private',motoclubeId:'a',statusMotoclube:status}],
    ['usuarios/applicant',{nome:'Solicitante',email:'private@example.test'}],
    ['motoclubes/a/solicitacoes/applicant',{status:'pendente'}],
  ]);
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const db={doc:p=>({get:async()=>({exists:store.has(p),data:()=>store.get(p)})})};
  const deps={
    'firebase-admin/app':{initializeApp(){}},'firebase-admin/storage':{},
    'firebase-functions/v2/firestore':{onDocumentDeleted:()=>{}},
    'firebase-functions/v2/https':{onCall:(_options,fn)=>fn,HttpsError},
    'firebase-admin/firestore':{getFirestore:()=>db,FieldValue:{}},
    './motoclubes':{createClubService:()=>()=>{}},
  };
  const exports={};new Function('require','exports',fs.readFileSync(path.resolve(__dirname,'../functions/index.js'),'utf8'))(id=>deps[id],exports);
  return (uid,userIds)=>exports.motoclubePerfis({auth:uid?{uid}:null,data:{motoclubeId:'a',userIds}});
}
test('consulta de membros retorna só campos de exibição; e-mail e telefone não saem do servidor', async()=>{
  assert.deepEqual(await fixture()('visitor',['user']),[{userId:'user',nome:'Ana',fotoUrl:'https://example.test/photo',cidade:'São Paulo',motoclubeId:'a'}]);
});
test('desligamento pendente oculta clube imediatamente na projeção pública, mesmo com vínculo interno', async()=>{
  const [profile]=await fixture('desligamento_pendente')('visitor',['user']);assert.equal(profile.motoclubeId,null);
});
test('perfis de solicitantes só podem ser resolvidos pelo responsável ou pelo próprio solicitante', async()=>{
  const call=fixture();await assert.rejects(call('visitor',['applicant']),{code:'permission-denied'});
  assert.equal((await call('admin',['applicant']))[0].nome,'Solicitante');
  assert.equal((await call('applicant',['applicant']))[0].nome,'Solicitante');
  await assert.rejects(call(null,['user']),{code:'unauthenticated'});
});
