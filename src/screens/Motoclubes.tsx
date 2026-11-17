import React, { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { acaoMotoclube, perfisMotoclube, PerfilClube } from '../services/motoclubes';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTemporaryImage } from '../hooks/useTemporaryImage';
import { uploadLocalImage } from '../services/imageUpload';
import { removeTemporaryImage } from '../services/temporaryImages';
import { BottomNav } from '../components/BottomNav';
import { BottomSheetMenu } from '../components/BottomSheetMenu';

const fields = [['nome','Nome oficial *'],['sigla','Sigla'],['logoUrl','URL HTTPS do logo / brasão *'],['descricao','Descrição'],['anoFundacao','Ano de fundação'],['cidade','Cidade *'],['uf','UF *'],['cnpj','CNPJ (opcional)'],['instagram','Instagram'],['facebook','Facebook'],['site','Site'],['contato','WhatsApp / contato oficial'],['endereco','Endereço / sede'],['observacoes','Observações']];
const date = (value: any) => value?.toDate?.().toLocaleDateString('pt-BR') || '—';

export function Motoclubes({navigation}: any) {
  const actionLock = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [logoUri, setLogoUri] = useTemporaryImage();
  const [clubs, setClubs] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [publicCnpj, setPublicCnpj] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<PerfilClube[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<any>(null);
  const [classification, setClassification] = useState('administrativo');
  const [reason, setReason] = useState('');
  const club = clubs.find(c => c.id === selected);
  const admin = !!club && club.responsavelUserId === auth.currentUser?.uid;
  const showError = (e: any) => setError(e?.message || 'Não foi possível carregar.');
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) return true;
      if (creating) {setCreating(false); return true;}
      if (selected) {setSelected(null); return true;}
      return false;
    });
    return () => subscription.remove();
  }, [creating, selected, busy]);
  const chooseLogo = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    let original: string | undefined;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Permita acesso à galeria para escolher o brasão.');
      const result = await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .8});
      if (result.canceled) return;
      original = result.assets[0].uri;
      const processed = await ImageManipulator.manipulateAsync(original, [{resize: {width: 512}}], {compress: .8, format: ImageManipulator.SaveFormat.JPEG});
      setLogoUri(processed.uri);
      setForm(current => ({...current, logoUrl: ''}));
    } catch (e) {showError(e);}
    finally {if (original) await removeTemporaryImage(original); actionLock.current = false; setBusy(false);}
  };
  useEffect(() => {
    const stopClubs = onSnapshot(collection(db, 'motoclubes'), s => setClubs(s.docs.map(d => ({...d.data(), id: d.id}))), showError);
    const uid = auth.currentUser?.uid;
    const stopUser = uid ? onSnapshot(doc(db, 'usuarios', uid), s => setUser(s.data()), showError) : () => {};
    return () => {stopClubs(); stopUser();};
  }, []);
  useEffect(() => {
    setRequests([]); setMembers([]); setHistory([]); setRemoving(null); setProfiles([]);
    if (!selected || !auth.currentUser) return;
    const stops = admin ? [
      onSnapshot(collection(db, 'motoclubes', selected, 'solicitacoes'), s => setRequests(s.docs.map(d => d.data())), showError),
      onSnapshot(collection(db, 'motoclubes', selected, 'membros'), s => setMembers(s.docs.map(d => d.data())), showError),
      onSnapshot(collection(db, 'motoclubes', selected, 'historico'), s => setHistory(s.docs.map(d => ({...d.data(), id: d.id}))), showError),
    ] : [onSnapshot(doc(db, 'motoclubes', selected, 'solicitacoes', auth.currentUser.uid), s => setRequests(s.exists() ? [s.data()] : []), showError)];
    return () => stops.forEach(stop => stop());
  }, [selected, admin]);
  const profileIds = JSON.stringify([...new Set([...(club?.membrosIds || []), ...requests.map(r => r.userId)])]);
  useEffect(() => {
    let active = true;
    if (selected) perfisMotoclube(selected, JSON.parse(profileIds)).then(p => {if (active) setProfiles(p);}).catch(showError);
    return () => {active = false;};
  }, [selected, profileIds, user?.statusMotoclube]);
  const perform = async (acao: string, extra: Record<string, unknown> = {}) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      if (acao === 'criar') {
        if (!logoUri && !form.logoUrl) throw new Error('Selecione o logo / brasão do Motoclube.');
        const logoUrl = form.logoUrl || await uploadLocalImage(logoUri!, `motoclubes/${auth.currentUser!.uid}/${Date.now()}.jpg`);
        setForm(current => ({...current, logoUrl}));
        extra = {clube: {...form, logoUrl, exibirCnpjPublicamente: publicCnpj}};
      }
      await acaoMotoclube(acao, {motoclubeId: selected, ...extra});
      if (acao === 'criar') {setCreating(false); setForm({}); setPublicCnpj(false); setLogoUri(null);}
      setRemoving(null);
    } catch (e: any) {setError(e?.message || 'Não foi possível salvar.');}
    finally {actionLock.current = false; setBusy(false);}
  };
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={busy || disabled} onPress={action} style={[styles.button, (busy || disabled) && {opacity: .4}]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
  const person = (uid: string) => {
    const p = profiles.find(p => p.userId === uid);
    return <View><Text style={styles.text}>{p?.nome || 'Motociclista'} {p?.cidade ? `· ${p.cidade}` : ''}</Text>{!!p?.fotoUrl && <Image source={{uri: p.fotoUrl}} style={styles.avatar} />}</View>;
  };
  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {button('VOLTAR', () => { if (creating) setCreating(false); else if (selected) setSelected(null); else navigation.goBack(); })}
    <Text style={styles.title}>{creating ? 'Cadastrar Motoclube' : club?.nome || 'Motoclubes'}</Text>
    <Text style={styles.text}>Amigo acompanha. Membro pertence.</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {busy && <Text style={styles.text}>Salvando...</Text>}
    {creating ? <>
      {button('SELECIONAR LOGO / BRASÃO *', chooseLogo)}
      {!!logoUri && <Image source={{uri: logoUri}} style={styles.logo} />}
      {fields.filter(([key]) => key !== 'logoUrl').map(([key, label]) => <View key={key}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={form[key] || ''} onChangeText={v => setForm({...form, [key]: key === 'uf' ? v.toUpperCase().slice(0, 2) : v})} /></View>)}
      <Text style={styles.text}>Exibir CNPJ publicamente</Text><Switch value={publicCnpj} onValueChange={setPublicCnpj} />
      {button('CADASTRAR', () => perform('criar', {clube: {...form, exibirCnpjPublicamente: publicCnpj}}))}
    </> : !club ? <>
      {button('CADASTRAR MOTOCLUBE', () => setCreating(true))}
      {clubs.map(c => <View key={c.id} style={styles.card}>{button(c.nome, () => setSelected(c.id))}<Text style={styles.text}>{c.cidade} / {c.uf}</Text></View>)}
      {!clubs.length && <Text style={styles.text}>Nenhum Motoclube cadastrado.</Text>}
    </> : <>
      {!!club.logoUrl && <Image source={{uri: club.logoUrl}} style={styles.logo} />}
      {fields.filter(([k]) => !['cnpj','logoUrl','nome'].includes(k)).map(([k,label]) => club[k] ? <Text key={k} style={styles.text}>{label.replace(' *','')}: {club[k]}</Text> : null)}
      {club.exibirCnpjPublicamente && !!club.cnpjPublico && <Text style={styles.text}>CNPJ: {club.cnpjPublico}</Text>}
      {button(club.amigosIds?.includes(auth.currentUser?.uid) ? 'DEIXAR DE SER AMIGO' : 'SOU AMIGO', () => perform(club.amigosIds?.includes(auth.currentUser?.uid) ? 'deixar_amigo' : 'amigo'))}
      {button('SOU MEMBRO', () => perform('solicitar'), !user || !!user.motoclubeId || user.statusMotoclube === 'pendente')}
      {!!user?.motoclubeId && user.motoclubeId !== selected && <Text style={styles.text}>Conclua seu desligamento atual antes de solicitar entrada em outro clube.</Text>}
      {user?.statusMotoclube === 'pendente' && <Text style={styles.text}>Você tem uma solicitação aguardando aprovação.</Text>}
      {requests.some(r => r.userId === auth.currentUser?.uid && r.status === 'pendente') && button('CANCELAR SOLICITAÇÃO', () => perform('cancelar'))}
      {user?.motoclubeId === selected && user?.statusMotoclube === 'membro' && button('SOLICITAR DESLIGAMENTO', () => Alert.alert('Solicitar desligamento', 'O clube será ocultado do seu perfil. O vínculo continua até a conclusão pelo responsável.', [{text: 'Cancelar'}, {text: 'Solicitar', onPress: () => perform('desligamento')}] ))}
      {user?.motoclubeId === selected && user?.statusMotoclube === 'desligamento_pendente' && <Text style={styles.text}>Desligamento aguardando conclusão pelo responsável.</Text>}
      <Text style={styles.title}>Membros</Text>
      {(club.membrosIds || []).map((uid: string) => <View key={uid} style={styles.card}>{person(uid)}{admin && <>
        <Text style={styles.text}>Entrada: {date(members.find(m => m.userId === uid)?.entrouEm)} · {members.find(m => m.userId === uid)?.situacao || 'membro'}</Text>
        {button('GERENCIAR MEMBRO', () => {setRemoving(members.find(m => m.userId === uid) || {userId: uid}); setReason(''); setClassification('administrativo');})}
      </>}</View>)}
      {admin && <>
        <Text style={styles.title}>Solicitações</Text>
        {requests.filter(r => r.status === 'pendente').map(r => <View key={r.userId} style={styles.card}>{person(r.userId)}<Text style={styles.text}>Solicitada em {date(r.solicitadoEm)}</Text>{button('APROVAR', () => perform('aprovar', {userId: r.userId}))}{button('RECUSAR', () => perform('recusar', {userId: r.userId}))}</View>)}
        {!!removing && <View style={styles.card}><Text style={styles.title}>Saída administrativa (privado)</Text>{person(removing.userId)}
          {['com_honra','sem_honra','administrativo'].map(t => <View key={t}>{button(`${classification === t ? '✓ ' : ''}${t.replace(/_/g,' ')}`, () => setClassification(t))}</View>)}
          <Text style={styles.text}>Motivo privado (opcional)</Text><TextInput style={styles.input} value={reason} onChangeText={setReason} maxLength={1000} />
          {button(removing.situacao === 'desligamento_pendente' ? 'CONCLUIR DESLIGAMENTO' : 'REMOVER MEMBRO', () => Alert.alert('Confirmar saída', 'Confirma a conclusão deste vínculo?', [{text: 'Cancelar'}, {text: 'Confirmar', onPress: () => perform(removing.situacao === 'desligamento_pendente' ? 'concluir' : 'remover', {userId: removing.userId, tipoDesligamento: classification, motivoDesligamento: reason})}]))}
        </View>}
        <Text style={styles.title}>Histórico administrativo (privado)</Text>
        {history.map(h => <View key={h.id} style={styles.card}><Text style={styles.text}>Usuário: {h.userId}{'\n'}Entrada: {date(h.entrouEm)} · Saída: {date(h.saiuEm)}{'\n'}{h.tipoDesligamento}{'\n'}{h.motivoDesligamento}{'\n'}Responsável: {h.removidoPor}</Text></View>)}
      </>}
    </>}
  </ScrollView>
    <BottomNav state={{routes: [{name: 'Motoclubes'}], index: 0}} navigation={navigation} onPressFab={() => setMenuVisible(true)} />
    <BottomSheetMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onSelectNovaManutencao={() => navigation.navigate('Manutencao')} onSelectNovoEvento={() => navigation.navigate('Eventos')} onSelectNovaViagem={() => navigation.navigate('Viagens')} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#121212'}, content: {padding: 20, paddingBottom: 100},
  title: {color: '#FFF', fontSize: 22, fontWeight: 'bold', marginVertical: 16}, text: {color: '#DDD', marginVertical: 6},
  error: {color: '#FF8A80', marginVertical: 12}, button: {backgroundColor: '#B71C1C', padding: 16, borderRadius: 8, marginVertical: 6},
  buttonText: {color: '#FFF', fontWeight: 'bold'}, input: {color: '#FFF', borderColor: '#555', borderWidth: 1, padding: 12, borderRadius: 6, marginBottom: 8},
  card: {padding: 14, backgroundColor: '#222', borderRadius: 8, marginVertical: 8}, logo: {width: 140, height: 140, resizeMode: 'contain'}, avatar: {width: 44, height: 44, borderRadius: 22},
});
