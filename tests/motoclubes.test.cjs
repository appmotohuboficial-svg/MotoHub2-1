const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createClubService} = require('../functions/motoclubes');

// Optimistic transaction double: read versions are rechecked at commit and the
// callback is retried after contention. No writes are applied on validation error.
function fixture() {
  const store = new Map(), versions = new Map(); let next = 0;
  function ref(path) { return {path, id: path.split('/').pop(), collection: name => col(`${path}/${name}`)}; }
  function col(path) { return {doc: key => ref(`${path}/${key || `id${++next}`}`)}; }
  const seed = (path, data) => {store.set(path, structuredClone(data)); versions.set(path, (versions.get(path) || 0) + 1);};
  const db = {doc: ref, collection: col, async runTransaction(callback) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const reads = new Map(), writes = []; let writing = false;
      const tx = {
        async get(r) { assert.equal(writing, false, 'Firestore requires all reads before writes'); reads.set(r.path, versions.get(r.path) || 0); const value = structuredClone(store.get(r.path)); return {exists: value !== undefined, data: () => value}; },
        set(r, data) {writing = true; writes.push(['set',r.path,data]);},
        update(r, data) {writing = true; writes.push(['update',r.path,data]);},
        delete(r) {writing = true; writes.push(['delete',r.path]);},
      };
      const result = await callback(tx);
      if ([...reads].some(([p,v]) => (versions.get(p) || 0) !== v)) continue;
      for (const [op,p,value] of writes) {
        if (op === 'delete') store.delete(p);
        else {if (op === 'update') assert.ok(store.has(p), 'cannot update missing document'); store.set(p, structuredClone(op === 'update' ? {...store.get(p), ...value} : value));}
        versions.set(p, (versions.get(p) || 0) + 1);
      }
      return result;
    }
    throw Error('too much contention');
  }};
  seed('usuarios/user', {nome: 'Ana', email: 'private@example.test'});
  seed('usuarios/admin', {nome: 'Responsável'});
  for (const id of ['a','b']) seed(`motoclubes/${id}`, {id, nome: id, responsavelUserId: 'admin', membrosIds: [], amigosIds: []});
  const service = createClubService(db, () => 'timestamp', (code,message) => {throw Object.assign(Error(message),{code});});
  const act = (uid,acao,motoclubeId='a',extra={}) => service(uid,{acao,motoclubeId,...extra});
  return {store,seed,act,service};
}

test('criar página não filia criador; CNPJ sem máscara permanece somente no documento privado por padrão', async () => {
  const f = fixture();
  const result = await f.service('user',{acao:'criar',clube:{nome:'Rat Bike',logoUrl:'https://example.test/logo.jpg',cidade:'São Paulo',uf:'SP',cnpj:'12.345.678/0001-99'}});
  const club=f.store.get(`motoclubes/${result.id}`);
  assert.deepEqual(club.membrosIds,[]); assert.equal(club.responsavelUserId,'user');
  assert.equal(club.exibirCnpjPublicamente,false); assert.equal(club.cnpjPublico,undefined); assert.equal(club.cnpj,undefined);
  assert.equal(f.store.get(`motoclubes/${result.id}/privado/cadastro`).cnpj,'12345678000199');
  assert.equal(f.store.get('usuarios/user').motoclubeId,undefined);
});
test('solicitar, aprovar e sincronizar usuário, lista e data de entrada', async () => {
  const f=fixture(); await f.act('user','solicitar');
  assert.equal(f.store.get('usuarios/user').motoclubeId,null);
  assert.equal(f.store.get('usuarios/user').statusMotoclube,'pendente');
  assert.equal(f.store.get('motoclubes/a/solicitacoes/user').status,'pendente');
  await f.act('admin','aprovar','a',{userId:'user'});
  assert.equal(f.store.get('usuarios/user').motoclubeId,'a');
  assert.equal(f.store.get('usuarios/user').statusMotoclube,'membro');
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,['user']);
  assert.equal(f.store.get('motoclubes/a/membros/user').entrouEm,'timestamp');
});
test('conta comum não aprova, recusa nem remove; responsável de outro clube não administra', async () => {
  const f=fixture(); await f.act('user','solicitar');
  for (const acao of ['aprovar','recusar','remover']) await assert.rejects(f.act('user',acao,'a',{userId:'user',tipoDesligamento:'administrativo'}),{code:'permission-denied'});
  f.seed('usuarios/other',{});
  await assert.rejects(f.act('other','aprovar','a',{userId:'user'}),{code:'permission-denied'});
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,[]);
});
test('aprovações concorrentes repetidas produzem um único vínculo; nova aprovação falha', async () => {
  const f=fixture(); await f.act('user','solicitar');
  const results=await Promise.allSettled([f.act('admin','aprovar','a',{userId:'user'}),f.act('admin','aprovar','a',{userId:'user'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,['user']);
  await assert.rejects(f.act('admin','aprovar','a',{userId:'user'}),{code:'failed-precondition'});
});
test('usuário com clube não solicita outro; aprovação revalida vínculo mesmo após solicitação', async () => {
  const f=fixture(); await f.act('user','solicitar');
  f.seed('usuarios/user',{...f.store.get('usuarios/user'),motoclubeId:'b',statusMotoclube:'membro'});
  await assert.rejects(f.act('admin','aprovar','a',{userId:'user'}),{code:'failed-precondition'});
  await assert.rejects(f.act('user','solicitar','b'),{code:'failed-precondition'});
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,[]);
  assert.equal(f.store.get('motoclubes/a/solicitacoes/user').status,'pendente');
});
test('amizade em vários clubes é independente de filiação e pode ser desfeita', async () => {
  const f=fixture(); await f.act('user','amigo'); await f.act('user','amigo','b'); await f.act('user','amigo');
  assert.deepEqual(f.store.get('motoclubes/a').amigosIds,['user']); assert.deepEqual(f.store.get('motoclubes/b').amigosIds,['user']);
  await f.act('user','deixar_amigo'); assert.deepEqual(f.store.get('motoclubes/a').amigosIds,[]);
  assert.equal(f.store.get('usuarios/user').motoclubeId,undefined);
});
test('recusa e cancelamento não criam vínculo, permitindo nova solicitação', async () => {
  const f=fixture(); await f.act('user','solicitar'); await f.act('admin','recusar','a',{userId:'user'});
  assert.equal(f.store.get('usuarios/user').statusMotoclube,'nenhum');
  assert.equal(f.store.get('motoclubes/a/solicitacoes/user').status,'recusado');
  await f.act('user','solicitar'); await f.act('user','cancelar');
  assert.equal(f.store.get('motoclubes/a/solicitacoes/user').status,'cancelado');
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,[]);
  await f.act('user','solicitar','b');
});
test('desligamento oculta vínculo público, conserva reserva e membro, conclusão gera histórico privado', async () => {
  const f=fixture(); await f.act('user','solicitar'); await f.act('admin','aprovar','a',{userId:'user'});
  await f.act('user','desligamento');
  const user=f.store.get('usuarios/user'); assert.equal(user.statusMotoclube,'desligamento_pendente'); assert.equal(user.motoclubeId,'a');
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,['user']);
  await assert.rejects(f.act('user','solicitar','b'),{code:'failed-precondition'});
  await f.act('admin','concluir','a',{userId:'user',tipoDesligamento:'com_honra',motivoDesligamento:'Privado'});
  assert.equal(f.store.get('usuarios/user').motoclubeId,null); assert.equal(f.store.get('usuarios/user').statusMotoclube,'nenhum');
  assert.deepEqual(f.store.get('motoclubes/a').membrosIds,[]); assert.equal(f.store.has('motoclubes/a/membros/user'),false);
  const history=[...f.store].find(([p])=>p.startsWith('motoclubes/a/historico/'))[1];
  assert.deepEqual(history,{userId:'user',entrouEm:'timestamp',saiuEm:'timestamp',tipoDesligamento:'com_honra',motivoDesligamento:'Privado',removidoPor:'admin'});
  assert.equal(f.store.get('motoclubes/a').motivoDesligamento,undefined);
  await f.act('user','solicitar','b');
});
test('remoção direta registra classificação privada; classificação desconhecida não altera dados', async () => {
  const f=fixture(); await f.act('user','solicitar'); await f.act('admin','aprovar','a',{userId:'user'});
  await assert.rejects(f.act('admin','remover','a',{userId:'user',tipoDesligamento:'outro'}),{code:'invalid-argument'});
  await f.act('admin','remover','a',{userId:'user',tipoDesligamento:'sem_honra',motivoDesligamento:'Somente administração'});
  assert.equal(f.store.get('usuarios/user').statusMotoclube,'nenhum');
  assert.equal(JSON.stringify(f.store.get('motoclubes/a')).includes('sem_honra'),false);
});
test('sessão ausente, caminho inválido e dois pedidos simultâneos são bloqueados', async () => {
  const f=fixture(); await assert.rejects(f.act(null,'solicitar'),{code:'unauthenticated'});
  await assert.rejects(f.act('user','solicitar','a/privado'),{code:'invalid-argument'});
  const results=await Promise.allSettled([f.act('user','solicitar','a'),f.act('user','solicitar','b')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
