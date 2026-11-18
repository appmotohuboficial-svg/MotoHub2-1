const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');

function load(file, deps) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (id.endsWith('.webp')) return id;
    if (!(id in deps)) throw Error('Dependência não simulada: ' + id);
    return deps[id];
  }, module, module.exports);
  return module.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function renderer() {
  const hooks = [];
  let cursor = 0, pending = [], dirty = true, component, props, tree;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(value) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof value === 'function' ? value() : value;
      return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; dirty = true; }];
    },
    useRef(value) { const i = cursor++; return hooks[i] || (hooks[i] = { current: value }); },
    useEffect(fn, deps) {
      const i = cursor++, old = hooks[i];
      if (!old || deps.some((x, j) => !Object.is(x, old.deps[j]))) {
        hooks[i] = { deps };
        pending.push(() => { old?.cleanup?.(); hooks[i].cleanup = fn(); });
      }
    },
  };
  return {
    react,
    mount(fn, input) { component = fn; props = input; },
    update(input) { props = input; dirty = true; },
    get tree() { return tree; },
    async flush() {
      for (let i = 0; i < 25; i++) {
        if (dirty) { cursor = 0; dirty = false; tree = component(props); }
        const effects = pending; pending = []; effects.forEach(fn => fn());
        await tick();
        if (!dirty && !pending.length) return;
      }
      throw Error('Render não estabilizou');
    },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props.children)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props.children) : String(tree);
}
function button(ui, label) {
  const item = nodes(ui.tree).find(x => x.type === 'TouchableOpacity' && text(x).trim() === label);
  assert.ok(item, 'Botão ausente: ' + label); return item.props;
}
function input(ui, label) {
  const item = nodes(ui.tree).find(x => x.type === 'TextInput' && x.props.placeholder === label);
  assert.ok(item, 'Campo ausente: ' + label); return item.props;
}

// StackRouter real detecta a regressão: navigate para uma tela anterior cria outra instância no v7.
async function fixture() {
  const routersFile = require.resolve('@react-navigation/routers', {
    paths: [path.dirname(require.resolve('@react-navigation/native'))],
  });
  const { StackRouter, CommonActions, StackActions } = await import(pathToFileURL(routersFile).href);
  const router = StackRouter({ initialRouteName: 'Garagem' });
  const options = { routeNames: ['Garagem', 'NovoCadastroMotos', 'DadosTecnicos'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options), uploadError, writeError, uploadWait;
  const mounted = new Map(), alerts = [], writes = [], uploads = [], auth = { currentUser: { uid: 'criador' } };
  const dispatch = action => {
    state = router.getStateForAction(state, action, options) || state;
    for (const [key, entry] of mounted) {
      const route = state.routes.find(r => r.key === key);
      if (route) entry.ui.update({ route, navigation: entry.navigation });
      else { entry.ui.unmount(); mounted.delete(key); }
    }
  };
  const mount = () => {
    for (const route of state.routes) {
      if (route.name === 'Garagem' || mounted.has(route.key)) continue;
      const ui = renderer();
      const navigation = {
        navigate: (name, params) => dispatch(CommonActions.navigate(name, params)),
        popTo: name => dispatch(StackActions.popTo(name)),
        goBack: () => dispatch(CommonActions.goBack()), dispatch,
      };
      const native = Object.fromEntries(['View', 'Text', 'TextInput', 'TouchableOpacity', 'ScrollView',
        'StatusBar', 'Image', 'KeyboardAvoidingView'].map(x => [x, x]));
      native.StyleSheet = { create: x => x }; native.Platform = { OS: 'android' };
      native.Alert = { alert: (...args) => alerts.push(args) };
      const navDeps = { CommonActions, usePreventRemove: () => {} };
      const hook = load('hooks/useSalvarMoto.ts', {
        react: ui.react, 'react-native': native, '@react-navigation/native': navDeps,
        'firebase/firestore': { collection: (_db, name) => name, addDoc: async (collection, data) => {
          if (writeError) throw writeError;
          writes.push({ collection, data }); return { id: 'moto-nova' };
        } },
        '../services/firebase': { auth, db: {} },
        '../services/imageUpload': { uploadLocalImage: async (uri, remote) => {
          uploads.push({ uri, remote }); await uploadWait;
          if (uploadError) throw uploadError;
          return 'https://foto.exemplo/moto.jpg';
        } },
      });
      const component = load('screens/' + route.name + '.tsx', {
        react: ui.react, 'react-native': native,
        'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
        '@react-navigation/native': navDeps,
        '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
        'expo-image-picker': { requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
          MediaTypeOptions: { Images: 'Images' }, launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///original.jpg' }] }) },
        'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async () => ({ uri: 'file:///foto.jpg' }) },
        '../hooks/useTemporaryImage': { useTemporaryImage: () => ui.react.useState(null) },
        '../services/temporaryImages': { removeTemporaryImage: async () => {} },
        '../hooks/useSalvarMoto': hook,
      })[route.name];
      ui.mount(component, { route, navigation });
      mounted.set(route.key, { ui, navigation });
    }
  };
  dispatch(CommonActions.navigate('NovoCadastroMotos')); mount();
  const f = {
    get state() { return state; }, get ui() { return mounted.get(state.routes[state.index].key)?.ui; },
    alerts, writes, uploads, auth,
    setUploadError(value) { uploadError = value; }, setWriteError(value) { writeError = value; },
    setUploadWait(value) { uploadWait = value; },
    async flush() { for (let i = 0; i < 4; i++) { mount(); for (const entry of mounted.values()) await entry.ui.flush(); } },
    back() { dispatch(CommonActions.goBack()); },
    async basics(photo = false) {
      await f.flush();
      for (const [label, value] of [['Marca (Ex: Honda, Yamaha...)', 'Honda'], ['Modelo (Ex: CB 500X, MT-07...)', 'CBR 1000 hrc'],
        ['Ano', '2007'], ['KM Atual', '100000']]) input(f.ui, label).onChangeText(value);
      if (photo) {
        const photoButton = nodes(f.ui.tree).find(x => x.type === 'TouchableOpacity' && nodes(x).some(n => n.type === 'Image'));
        await photoButton.props.onPress();
      }
      await f.flush();
    },
    async technical() {
      const open = nodes(f.ui.tree).find(x => x.type === 'TouchableOpacity' && /Dados Técnicos/.test(text(x)));
      await open.props.onPress(); await f.flush();
    },
  };
  await f.flush(); return f;
}

test('básico salva uma moto e retorna à garagem', async () => {
  const f = await fixture(); await f.basics();
  await button(f.ui, 'SALVAR NA GARAGEM').onPress(); await f.flush();
  assert.deepEqual(f.state.routes.map(x => x.name), ['Garagem']);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].data.hodometro, 100000);
  assert.equal(f.writes[0].data.userId, 'criador');
});

test('ficha salva básicos, foto e técnicos juntos sem abrir outro cadastro', async () => {
  const f = await fixture(); await f.basics(true); await f.technical();
  input(f.ui, 'Ex: 10W40').onChangeText('15w40');
  input(f.ui, 'Dianteira (psi)').onChangeText('32');
  input(f.ui, 'Traseira (psi)').onChangeText('36');
  input(f.ui, 'Ex: 16').onChangeText('19'); await f.flush();
  assert.equal(f.writes.length, 0);
  await button(f.ui, 'SALVAR MOTO NA GARAGEM').onPress(); await f.flush();
  assert.deepEqual(f.state.routes.map(x => x.name), ['Garagem']);
  assert.equal(f.writes.length, 1);
  const data = f.writes[0].data;
  assert.equal(data.marca, 'Honda'); assert.equal(data.modelo, 'CBR 1000 hrc');
  assert.equal(data.viscosidade, '15w40'); assert.equal(data.capacidadeTanque, '19');
  assert.equal(data.fotoUri, 'https://foto.exemplo/moto.jpg');
});

test('voltar da ficha preserva básico, foto e rascunho técnico sem duplicar telas', async () => {
  const f = await fixture(); await f.basics(true);
  const originalKey = f.state.routes.at(-1).key;
  await f.technical(); input(f.ui, 'Ex: 10W40').onChangeText('15w40'); await f.flush();
  f.back(); await f.flush();
  assert.equal(f.state.routes.at(-1).key, originalKey);
  assert.equal(input(f.ui, 'Modelo (Ex: CB 500X, MT-07...)').value, 'CBR 1000 hrc');
  assert.ok(nodes(f.ui.tree).some(x => x.type === 'Image' && x.props.source.uri === 'file:///foto.jpg'));
  await f.technical(); assert.equal(input(f.ui, 'Ex: 10W40').value, '15w40');
  f.back(); await f.flush(); await button(f.ui, 'SALVAR NA GARAGEM').onPress(); await f.flush();
  assert.equal(f.writes[0].data.viscosidade, '15w40');
  assert.deepEqual(f.state.routes.map(x => x.name), ['Garagem']);
});

test('cota da foto não grava nem perde formulário; salvar sem foto exige escolha', async () => {
  const f = await fixture(); await f.basics(true); await f.technical();
  input(f.ui, 'Ex: 10W40').onChangeText('15w40'); await f.flush();
  f.setUploadError(Object.assign(new Error('quota'), { code: 'storage/quota-exceeded' }));
  await button(f.ui, 'SALVAR MOTO NA GARAGEM').onPress(); await f.flush();
  assert.equal(f.writes.length, 0); assert.equal(f.state.routes.at(-1).name, 'DadosTecnicos');
  assert.equal(input(f.ui, 'Ex: 10W40').value, '15w40');
  const alert = f.alerts.at(-1); assert.match(alert[1], /não é um limite de motos/);
  assert.equal(alert[2][0].style, 'cancel');
  await alert[2].find(x => x.text === 'Salvar sem foto').onPress(); await f.flush();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].data.fotoUri, '');
  assert.equal(f.writes[0].data.viscosidade, '15w40'); assert.equal(f.uploads.length, 1);
  assert.deepEqual(f.state.routes.map(x => x.name), ['Garagem']);
});

test('toques repetidos durante upload geram somente um cadastro', async () => {
  const f = await fixture(); await f.basics(true);
  let release; f.setUploadWait(new Promise(resolve => { release = resolve; }));
  const save = button(f.ui, 'SALVAR NA GARAGEM').onPress;
  const pending = save(); await save(); await f.flush();
  assert.equal(button(f.ui, 'SALVANDO...').disabled, true);
  release(); await pending; await save(); await f.flush();
  assert.equal(f.writes.length, 1); assert.equal(f.uploads.length, 1);
});

test('dados obrigatórios, KM e sessão inválidos impedem gravação', async () => {
  const f = await fixture(); await button(f.ui, 'SALVAR NA GARAGEM').onPress();
  await button(f.ui, 'Preencher Dados Técnicos').onPress(); await f.flush();
  assert.equal(f.state.routes.at(-1).name, 'NovoCadastroMotos');
  await f.basics(); input(f.ui, 'KM Atual').onChangeText('-1'); await f.flush();
  await button(f.ui, 'SALVAR NA GARAGEM').onPress();
  input(f.ui, 'KM Atual').onChangeText('100000'); await f.flush();
  f.auth.currentUser = null; await button(f.ui, 'SALVAR NA GARAGEM').onPress();
  assert.equal(f.writes.length, 0); assert.equal(f.uploads.length, 0);
});

test('erro no banco preserva ficha e permite tentar novamente', async () => {
  const f = await fixture(); await f.basics(); await f.technical();
  input(f.ui, 'Ex: 10W40').onChangeText('10W40'); await f.flush();
  f.setWriteError(new Error('Sem conexão'));
  await button(f.ui, 'SALVAR MOTO NA GARAGEM').onPress(); await f.flush();
  assert.equal(f.state.routes.at(-1).name, 'DadosTecnicos');
  assert.equal(input(f.ui, 'Ex: 10W40').value, '10W40'); assert.equal(f.writes.length, 0);
  f.setWriteError(null); await button(f.ui, 'SALVAR MOTO NA GARAGEM').onPress(); await f.flush();
  assert.equal(f.writes.length, 1); assert.deepEqual(f.state.routes.map(x => x.name), ['Garagem']);
});
