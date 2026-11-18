const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function screenFixture(file, params, seed, overrides = {}) {
  const store = new Map(Object.entries(seed)), alerts = [], writes = [], states = [], effects = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({type,props:{...props,children}}),
    useState(initial) {const index=cursor++; if (!(index in states)) states[index]=typeof initial==='function'?initial():initial; return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
    useRef(initial) {return this.useState({current:initial})[0];},
    useMemo(fn) {return fn();},
    useEffect(fn) {effects.push(fn);},
  };
  react.useRef = initial => react.useState({current:initial})[0];
  const reference = (...args) => {const parts=args[0]?.path ? [args[0].path,...args.slice(1)] : args.slice(1); return {path:parts.join('/'),id:parts.at(-1)};};
  const snapshot = r => ({exists:()=>store.has(r.path),data:()=>store.get(r.path)});
  const save = (ref,data) => {assert.ok(store.has(ref.path)); writes.push(ref.path); store.set(ref.path,{...store.get(ref.path),...data});};
  const fire = {collection:reference,doc:reference,serverTimestamp:()=> 'NEW_TIMESTAMP',Timestamp:{fromDate:date=>date},
    getDoc:async r=>snapshot(r), updateDoc:async (r,data)=>save(r,data),
    setDoc:async (r,data)=>{writes.push(r.path);store.set(r.path,data);},
    addDoc:async()=>{throw Error('Editing must not create another document');},
    runTransaction:async (_db,cb)=>cb({get:async r=>snapshot(r),update:save,set:()=>{throw Error('Editing must not create another document');}}),
  };
  const rn = new Proxy({StyleSheet:{create:s=>s},Platform:{OS:'android'},Alert:{alert:(...args)=>alerts.push(args)}},{get:(target,key)=>target[key] || key});
  const deps = {
    react, 'react-native':rn,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@expo/vector-icons':{MaterialCommunityIcons:'Icon'},'@react-native-community/datetimepicker':{default:'DateTimePicker'},
    'firebase/firestore':fire,'../services/firebase':{db:{},auth:{currentUser:{uid:'owner'}}},
    '../hooks/useTemporaryImage':{useTemporaryImage:()=>react.useState(null)},
    '../services/imageUpload':{uploadLocalImage:()=>{throw Error('Existing flyer must not be uploaded again');},deleteUploadedImage:()=>{throw Error('Existing flyer must not be removed');}},
    'expo-image-picker':{},'../services/consumo':{},'../components/MapaRoteiro':{MapaRoteiro:'MapaRoteiro'},
    '../services/rotas':{tracarRota:async()=>({distanciaKm:100,duracaoSegundos:3600,coordenadas:[{latitude:-23,longitude:-46},{latitude:-24,longitude:-47}],pontos:[]})},
    ...overrides,
  };
  const load = p => {
    const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    new Function('require','module','exports',code)(id=>{
      if (id in deps) return deps[id];
      if (id.startsWith('../utils/')) return load(path.resolve('src/utils',id.split('/').at(-1)+'.ts'));
      if (id.includes('assets/')) return {};
      throw Error('Unexpected dependency '+id);
    },module,module.exports);
    return module.exports;
  };
  const Component=load(path.resolve('src/screens',file+'.tsx'))[file];
  let tree;
  const render=()=>{cursor=0;tree=Component({route:{params},navigation:{goBack(){},popTo(){}}});return tree;};
  const nodes=(node=tree)=>Array.isArray(node)?node.flatMap(n=>nodes(n)):node && typeof node==='object'?[node,...nodes(node.props?.children)]:[];
  return {store,writes,alerts,render,nodes,effects, fire, change(placeholder,value){const input=nodes().find(n=>n.type==='TextInput' && n.props.placeholder===placeholder); assert.ok(input,placeholder); input.props.onChangeText(value);render();},
    save:async name=>{const button=nodes().find(n=>n.type==='TouchableOpacity' && n.props.onPress?.name===name);assert.ok(button,name);await button.props.onPress();render();}};
}

test('editar manutenção preenche dados, atualiza mesmo registro e preserva criação e hodômetro', async () => {
  const registro={id:'record',categoria:'Óleo',data:'20/10/2026',dataVencimento:'',km:'20000',observacoes:'original',oficina:'Oficina',marcaOleo:'10W40',trocouFiltro:true,createdAt:'OLD_TIMESTAMP'};
  const f=screenFixture('FormularioManutencao',{motoId:'bike',categoria:'Óleo',registro},{'motos/bike':{userId:'owner',hodometro:'30000'},'motos/bike/manutencoes/record':registro});
  f.render(); f.effects[0](); await new Promise(resolve=>setImmediate(resolve)); f.render();
  f.change('Detalhes adicionais...','Corrigido'); await f.save('handleSalvarManutencao');
  assert.equal(f.alerts.at(-1)?.[0], 'Sucesso', JSON.stringify(f.alerts));
  const result=f.store.get('motos/bike/manutencoes/record');
  assert.equal(result.observacoes,'Corrigido'); assert.equal(result.data,'20/10/2026');assert.equal(result.marcaOleo,'10W40');assert.equal(result.trocouFiltro,true);
  assert.equal(result.createdAt,'OLD_TIMESTAMP');assert.equal(result.updatedAt,'NEW_TIMESTAMP');
  assert.equal(f.store.get('motos/bike').hodometro,'30000');assert.deepEqual(f.writes,['motos/bike/manutencoes/record']);
});
test('edição de manutenção de outra pessoa não grava nem informa sucesso', async () => {
  const f=screenFixture('FormularioManutencao',{motoId:'bike',categoria:'Óleo',registro:{id:'record'}},{'motos/bike':{userId:'other'},'motos/bike/manutencoes/record':{}});
  f.render(); f.effects[0](); await new Promise(resolve=>setImmediate(resolve)); f.render();
  await f.save('handleSalvarManutencao'); assert.deepEqual(f.writes,[]);assert.equal(f.alerts.at(-1)[0],'Erro');
});
test('editar evento preserva flyer e data de criação, corrige campos e recalcula expiração', async () => {
  const evento={id:'event',userId:'owner',nomeEvento:'Encontro',cidade:'São Paulo',uf:'SP',local:'Local antigo',dataInicio:'20/11/2026',dataFim:'21/11/2026',horarioInicio:'10:30',horarioFim:'18:45',estruturas:['camping'],flyerUri:'https://example.test/banner',flyerPath:'eventos/owner/original.jpg',flyerMetadata:{fileName:'original.jpg',contentType:'image/jpeg'},createdAt:'OLD_TIMESTAMP'};
  const f=screenFixture('NovoEvento',{evento},{'eventos/event':evento});f.render();f.change('Local / Endereço Completo','Novo local');await f.save('handleSalvarEvento');
  const result=f.store.get('eventos/event');assert.equal(result.local,'Novo local');assert.equal(result.flyerUri,evento.flyerUri);assert.deepEqual(result.flyerMetadata,evento.flyerMetadata);assert.equal(result.flyerPath,evento.flyerPath);assert.equal(result.createdAt,'OLD_TIMESTAMP');
  assert.equal(result.horarioInicio,'10:30');assert.equal(result.expiresAt.getHours(),18);assert.equal(result.expiresAt.getMinutes(),45);assert.deepEqual(f.writes,['eventos/event']);
});
test('evento de outro responsável recusa alteração', async () => {
  const evento={id:'event',userId:'other',nomeEvento:'Encontro',cidade:'São Paulo',uf:'SP',dataInicio:'20/11/2026',dataFim:'21/11/2026'};
  const f=screenFixture('NovoEvento',{evento},{'eventos/event':evento});f.render();await f.save('handleSalvarEvento');assert.deepEqual(f.writes,[]);assert.equal(f.alerts.at(-1)[0],'Erro');
});
test('editar viagem salva mesmo documento, mantém criação e substitui roteiro calculado', async () => {
  const f=screenFixture('ResumoRoteiro',{viagemId:'trip',origem:'São Paulo - SP',destino:'Santos - SP',consumoMedio:'20',observacoes:'Corrigido',motoId:'bike'}, {'viagens/trip':{userId:'owner',createdAt:'OLD_TIMESTAMP',observacoes:'original',rotaPolyline:'old'}});
  f.render();f.effects[0]();await new Promise(resolve=>setImmediate(resolve));f.render();await f.save('concluir');
  const result=f.store.get('viagens/trip');assert.equal(result.observacoes,'Corrigido');assert.equal(result.createdAt,'OLD_TIMESTAMP');assert.notEqual(result.rotaPolyline,'old');assert.equal(result.distanciaKm,100);assert.deepEqual(f.writes,['viagens/trip']);
});
test('viagem alheia não pode ser corrigida por parâmetro adulterado', async () => {
  const f=screenFixture('ResumoRoteiro',{viagemId:'trip',origem:'A - SP',destino:'B - SP',consumoMedio:'20'}, {'viagens/trip':{userId:'other',createdAt:'OLD_TIMESTAMP'}});
  f.render();f.effects[0]();await new Promise(resolve=>setImmediate(resolve));f.render();await f.save('concluir');assert.deepEqual(f.writes,[]);assert.equal(f.alerts.at(-1)[0],'Erro ao salvar');
});

test('formulário de viagem restaura município composto, UF, paradas, consumo e datas existentes', () => {
  const f=screenFixture('NovaViagem',{viagem:{id:'trip',origem:'São José dos Campos - SP',destino:'Belo Horizonte - MG',consumoMedio:'22,5',dataPartida:'20/11/2026',dataRetorno:'23/11/2026',pontosIntermediarios:[{local:'Passa Quatro - MG',tipo:'parada'}]}},{});
  f.render();const input=label=>f.nodes().find(n=>n.type==='TextInput' && n.props.placeholder===label).props.value;
  assert.equal(input('Cidade de partida'),'São José dos Campos');assert.equal(input('Cidade destino'),'Belo Horizonte');
  assert.deepEqual(f.nodes().filter(n=>n.type==='TextInput' && n.props.placeholder==='UF').map(n=>n.props.value),['SP','MG']);
  assert.equal(input('Consumo Médio da Moto (km/l)'),'22,5');assert.equal(input('Cidade - UF'),'Passa Quatro - MG');
});
