const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

test('Firestore Emulator: permissões, privacidade e aprovação concorrente no banco', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST && 'Requer Firebase CLI, Java e FIRESTORE_EMULATOR_HOST; não usa produção',
}, async t => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Somente emulador local');
  const projectId = 'demo-motohub-clubes';
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', body: JSON.stringify({rules:{files:[{content:fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8')}]}}),
  });
  assert.equal(response.ok,true,await response.text());
  const requireFunctions = createRequire(path.resolve(__dirname,'../functions/package.json'));
  const adminApp = requireFunctions('firebase-admin/app');
  const adminFirestore = requireFunctions('firebase-admin/firestore');
  const app=adminApp.initializeApp({projectId},'club-test');
  const db=adminFirestore.getFirestore(app);
  const {initializeApp,deleteApp} = require('firebase/app');
  const {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,updateDoc,deleteDoc,terminate} = require('firebase/firestore');
  const clients=[];
  const client=uid=>{
    const app=initializeApp({projectId,apiKey:'emulator-only'},uid);
    const db=getFirestore(app); const [hostname,port]=host.split(':');
    connectFirestoreEmulator(db,hostname,Number(port),{mockUserToken:{sub:uid,user_id:uid}});
    clients.push({app,db}); return db;
  };
  const user=client('user'), manager=client('admin'), stranger=client('stranger');
  const deny=promise=>assert.rejects(promise,e=>e.code==='permission-denied');
  try {
    await db.doc('usuarios/user').set({nome:'Ana',email:'privado@example.test'});
    await db.doc('usuarios/admin').set({nome:'Responsável'});
    for (const id of ['a','b']) await db.doc(`motoclubes/${id}`).set({id,nome:id,responsavelUserId:'admin',membrosIds:[],amigosIds:[]});
    await db.doc('motoclubes/a/privado/cadastro').set({cnpj:'12345678000199'});
    const service=require('../functions/motoclubes').createClubService(db,()=>adminFirestore.FieldValue.serverTimestamp(),(code,message)=>{throw Object.assign(Error(message),{code});});
    const act=(uid,acao,motoclubeId='a',extra={})=>service(uid,{acao,motoclubeId,...extra});
    await t.test('perfil só aceita edição normal; vínculo direto, autoaprovação e manipulação de listas são negados', async()=>{
      await updateDoc(doc(user,'usuarios/user'),{nome:'Nome corrigido'});
      await deny(updateDoc(doc(user,'usuarios/user'),{motoclubeId:'a',statusMotoclube:'membro'}));
      await deny(setDoc(doc(stranger,'usuarios/stranger'),{motoclubeId:'a',statusMotoclube:'membro'}));
      await deny(updateDoc(doc(user,'motoclubes/a'),{membrosIds:['user']}));
      await deny(setDoc(doc(user,'motoclubes/a/solicitacoes/user'),{status:'aprovado'}));
      await deny(getDoc(doc(stranger,'usuarios/user')));
    });
    await t.test('manutenção, viagem e evento aceitam dono e rejeitam outra conta', async()=>{
      await db.doc('motos/bike').set({userId:'user'});
      await db.doc('motos/bike/manutencoes/record').set({observacoes:'original'});
      for (const name of ['viagens','eventos']) await db.doc(`${name}/record`).set({userId:'user',observacoes:'original'});
      for (const p of ['motos/bike/manutencoes/record','viagens/record','eventos/record']) {
        await updateDoc(doc(user,p),{observacoes:'corrigido'});
        await deny(updateDoc(doc(stranger,p),{observacoes:'fraude'}));
      }
    });
    await t.test('banco serializa aprovação duplicada e mantém um único vínculo', async()=>{
      await act('user','solicitar');
      const results=await Promise.allSettled([act('admin','aprovar','a',{userId:'user'}),act('admin','aprovar','a',{userId:'user'})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.deepEqual((await db.doc('motoclubes/a').get()).data().membrosIds,['user']);
      assert.equal((await db.doc('usuarios/user').get()).data().motoclubeId,'a');
      await assert.rejects(act('user','solicitar','b'),{code:'failed-precondition'});
      await deny(deleteDoc(doc(user,'usuarios/user')));
    });
    await t.test('desligamento preserva reserva; histórico e CNPJ privado só são lidos pelo responsável', async()=>{
      await act('user','desligamento');
      assert.equal((await db.doc('usuarios/user').get()).data().statusMotoclube,'desligamento_pendente');
      assert.deepEqual((await db.doc('motoclubes/a').get()).data().membrosIds,['user']);
      await act('admin','concluir','a',{userId:'user',tipoDesligamento:'administrativo',motivoDesligamento:'Privado'});
      const h=(await db.collection('motoclubes/a/historico').get()).docs[0];
      await deny(getDoc(doc(user,h.ref.path)));await deny(getDoc(doc(stranger,h.ref.path)));
      assert.equal((await getDoc(doc(manager,h.ref.path))).data().motivoDesligamento,'Privado');
      await deny(getDoc(doc(user,'motoclubes/a/privado/cadastro')));
      assert.equal((await getDoc(doc(manager,'motoclubes/a/privado/cadastro'))).data().cnpj,'12345678000199');
    });
  } finally {
    await Promise.all(clients.map(async c=>{await terminate(c.db);await deleteApp(c.app);}));
    await db.terminate();await adminApp.deleteApp(app);
  }
});
