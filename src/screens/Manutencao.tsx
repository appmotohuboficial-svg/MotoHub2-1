import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ImageBackground,
  Image,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs, getDoc, doc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { Moto } from '../types';
import { dataLocal } from '../utils/datas';

interface Categoria {
  id: string;
  nome: string;
  icone: any;
}

interface RegistroManutencao {
  id: string;
  categoria?: string;
  data?: string;
  km?: number | string;
  oficina?: string;
  observacoes?: string;
  marcaOleo?: string;
  viscosidadeOleo?: string;
  dataVencimento?: string;
}

export function Manutencao({ route, navigation }: any) {
  // Verifica se veio uma moto específica via parâmetro
  const paramMoto = route?.params?.moto;

  const [motos, setMotos] = useState<Moto[]>([]);
  const [motoSelecionada, setMotoSelecionada] = useState<Moto | null>(null);
  const [modalMotosVisible, setModalMotosVisible] = useState(false);
  const [carregandoMotos, setCarregandoMotos] = useState(true);
  const [erroMotos, setErroMotos] = useState('');
  const [atualizacaoMotos, setAtualizacaoMotos] = useState(0);
  const [historico, setHistorico] = useState<{ motoId: string; registros: RegistroManutencao[] }>({ motoId: '', registros: [] });
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');
  const [atualizacaoHistorico, setAtualizacaoHistorico] = useState(0);
  const [acaoEmCurso, setAcaoEmCurso] = useState(false);
  const travaAcao = useRef(false);
  const contextoHistorico = useRef(0);
  const motoId = motoSelecionada?.id;

  // Categorias de manutenção
  const categorias: Categoria[] = [
    { id: '1', nome: 'Óleo', icone: require('../../assets/oleo.webp') },
    { id: '2', nome: 'Pneu', icone: require('../../assets/pneu.webp') },
    { id: '3', nome: 'Relação', icone: require('../../assets/relacao.webp') },
    { id: '4', nome: 'Freios', icone: require('../../assets/freios.webp') },
    { id: '5', nome: 'Bateria', icone: require('../../assets/bateria.webp') },
    { id: '6', nome: 'Seguro', icone: require('../../assets/seguro.webp') },
    { id: '7', nome: 'Documentos', icone: require('../../assets/documento.webp') },
    { id: '8', nome: 'Revisão', icone: require('../../assets/revisao.webp') },
    { id: '9', nome: 'Outros', icone: require('../../assets/outros.webp') },
  ];

  // Busca as motos do usuário no Firestore ao abrir a tela
  useEffect(() => {
    let ativo = true;
    const fetchMotos = async () => {
      const user = auth.currentUser;
      setCarregandoMotos(true);
      setErroMotos('');
      if (!user) {
        setMotos([]);
        setMotoSelecionada(null);
        setErroMotos('Entre na sua conta para consultar as motos.');
        setCarregandoMotos(false);
        return;
      }

      try {
        const q = query(collection(db, 'motos'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const lista: Moto[] = [];
        querySnapshot.forEach((item) => {
          lista.push({ ...item.data(), id: item.id } as Moto);
        });
        if (!ativo || auth.currentUser?.uid !== user.uid) return;
        setMotos(lista);
        // Parâmetros de navegação só são aceitos se a moto pertence ao usuário.
        setMotoSelecionada(anterior => lista.find(item => item.id === paramMoto?.id)
          || lista.find(item => item.id === anterior?.id) || lista[0] || null);
      } catch (error) {
        if (ativo) {
          setMotos([]);
          setMotoSelecionada(null);
          setErroMotos('Não foi possível carregar as motos. Tente novamente.');
        }
      } finally {
        if (ativo) setCarregandoMotos(false);
      }
    };

    fetchMotos();
    return () => { ativo = false; };
  }, [paramMoto?.id, atualizacaoMotos]);

  // Atualiza ao voltar do formulário e descarta respostas da moto anterior.
  useFocusEffect(useCallback(() => {
    let ativo = true;
    contextoHistorico.current += 1;
    const cancelar = () => {
      ativo = false;
      contextoHistorico.current += 1;
    };
    const user = auth.currentUser;
    setHistorico({ motoId: motoId || '', registros: [] });
    setErroHistorico('');
    if (!motoId || !user) {
      setCarregandoHistorico(false);
      if (motoId) setErroHistorico('Entre na sua conta para consultar o histórico.');
      return cancelar;
    }

    const fetchHistorico = async () => {
      setCarregandoHistorico(true);
      try {
        const moto = await getDoc(doc(db, 'motos', motoId));
        if (!moto.exists() || moto.data().userId !== user.uid || auth.currentUser?.uid !== user.uid) {
          throw new Error('Sem permissão para consultar esta moto.');
        }
        if (!ativo) return;
        const snapshot = await getDocs(collection(db, 'motos', motoId, 'manutencoes'));
        const registros = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as RegistroManutencao));
        // Datas legadas são dd/MM/aaaa. Não exigir createdAt mantém registros antigos na lista.
        registros.sort((a, b) => {
          const dataA = dataLocal(a.data)?.getTime() ?? -Infinity;
          const dataB = dataLocal(b.data)?.getTime() ?? -Infinity;
          return dataA === dataB ? a.id.localeCompare(b.id) : dataA > dataB ? -1 : 1;
        });
        if (ativo && auth.currentUser?.uid === user.uid) setHistorico({ motoId, registros });
      } catch (error) {
        if (ativo) setErroHistorico(error instanceof Error ? error.message : 'Não foi possível carregar o histórico.');
      } finally {
        if (ativo) setCarregandoHistorico(false);
      }
    };

    fetchHistorico();
    return cancelar;
  }, [motoId, atualizacaoHistorico]));

  const handleCategoriaPress = (categoriaNome: string) => {
    if (!motoId || !auth.currentUser) {
      Alert.alert('Atenção', 'Selecione uma moto da sua garagem para registrar a manutenção.');
      return;
    }
    navigation?.navigate('FormularioManutencao', { 
      categoria: categoriaNome,
      motoId,
      registro: undefined,
      motoNome: motoSelecionada ? `${motoSelecionada.marca} ${motoSelecionada.modelo}` : ''
    });
  };

  const handleEditar = async (registro: RegistroManutencao) => {
    if (!motoId || travaAcao.current) return;
    const user = auth.currentUser;
    const contexto = contextoHistorico.current;
    travaAcao.current = true;
    setAcaoEmCurso(true);
    try {
      if (!user) throw new Error('Entre na sua conta para editar.');
      const moto = await getDoc(doc(db, 'motos', motoId));
      if (!moto.exists() || moto.data().userId !== user.uid || auth.currentUser?.uid !== user.uid) {
        throw new Error('Sem permissão para esta moto.');
      }
      const atual = await getDoc(doc(db, 'motos', motoId, 'manutencoes', registro.id));
      if (!atual.exists()) throw new Error('Registro não encontrado. Atualize o histórico.');
      if (auth.currentUser?.uid !== user.uid) throw new Error('Sua sessão mudou. Abra o histórico novamente.');
      // Sair da tela ou trocar a moto invalida uma abertura ainda pendente.
      if (contexto !== contextoHistorico.current) return;
      navigation?.navigate('FormularioManutencao', {
        registro: { ...atual.data(), id: atual.id },
        categoria: atual.data().categoria || 'Geral',
        motoId,
        motoNome: `${motoSelecionada.marca} ${motoSelecionada.modelo}`,
      });
    } catch (error) {
      if (contexto === contextoHistorico.current) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível abrir o registro.');
      }
    } finally {
      travaAcao.current = false;
      setAcaoEmCurso(false);
    }
  };

  const handleExcluir = (registro: RegistroManutencao) => {
    if (!motoId || travaAcao.current) return;
    const userId = auth.currentUser?.uid;
    Alert.alert(
      'Excluir manutenção',
      `Excluir o registro de ${registro.categoria || 'manutenção'}${registro.data ? ` de ${registro.data}` : ''} desta moto? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            if (travaAcao.current) return;
            travaAcao.current = true;
            setAcaoEmCurso(true);
            try {
              if (!userId || auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para excluir.');
              const motoRef = doc(db, 'motos', motoId);
              const registroRef = doc(db, 'motos', motoId, 'manutencoes', registro.id);
              await runTransaction(db, async tx => {
                const moto = await tx.get(motoRef);
                if (!moto.exists() || moto.data().userId !== userId || auth.currentUser?.uid !== userId) {
                  throw new Error('Sem permissão para esta moto.');
                }
                const atual = await tx.get(registroRef);
                if (!atual.exists()) throw new Error('Registro não encontrado. Atualize o histórico.');
                if (auth.currentUser?.uid !== userId) throw new Error('Sua sessão mudou. Abra o histórico novamente.');
                tx.delete(registroRef);
              });
              setHistorico(anterior => anterior.motoId === motoId
                ? { ...anterior, registros: anterior.registros.filter(item => item.id !== registro.id) }
                : anterior);
              setAtualizacaoHistorico(valor => valor + 1);
            } catch (error) {
              Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível excluir o registro.');
            } finally {
              travaAcao.current = false;
              setAcaoEmCurso(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header Padronizado */}
      <ImageBackground 
        source={require('../../assets/banner.webp')} 
        style={styles.header}
        imageStyle={{ opacity: 0.8 }}
      >
        <View style={styles.headerOverlay}>
          <View style={styles.topBar}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation?.goBack()}
            >
              <Text style={styles.backButtonText}>&lt;</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerTexts}>
            <Text style={styles.title}>Manutenção</Text>
            <View style={styles.redLine} />
            <Text style={styles.subtitle}>Cuide bem da sua máquina</Text>
          </View>
        </View>
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Seleção de Moto Dinâmica */}
        <Text style={styles.sectionTitle}>SELECIONE A MOTO</Text>
        <TouchableOpacity 
          style={styles.spinnerContainer} 
          activeOpacity={0.8}
          disabled={carregandoMotos || acaoEmCurso}
          onPress={() => setModalMotosVisible(true)}
        >
          <Text style={styles.spinnerText}>
            {carregandoMotos ? 'Carregando motos...' : motoSelecionada
              ? `${motoSelecionada.marca} ${motoSelecionada.modelo} ${motoSelecionada.apelido ? `("${motoSelecionada.apelido}")` : ''}` 
              : 'Nenhuma moto encontrada'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={24} color="#AAAAAA" />
        </TouchableOpacity>
        {erroMotos ? (
          <View style={styles.historyStatus}>
            <Text style={styles.historyDetails}>{erroMotos}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => setAtualizacaoMotos(valor => valor + 1)}>
              <Text style={styles.editText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Categorias */}
        <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 16 }]}>CATEGORIAS</Text>

        <View style={styles.gridContainer}>
          {categorias.map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={styles.categoryCard}
              onPress={() => handleCategoriaPress(item.nome)}
              disabled={acaoEmCurso}
              activeOpacity={0.7}
            >
              <Image source={item.icone} style={styles.categoryIcon} resizeMode="contain" />
              <Text style={styles.categoryName}>{item.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 16 }]}>HISTÓRICO DE MANUTENÇÕES</Text>
        {!motoId ? (
          <Text style={styles.historyDetails}>Selecione uma moto para consultar o histórico.</Text>
        ) : carregandoHistorico || historico.motoId !== motoId ? (
          <View style={styles.historyStatus}>
            <ActivityIndicator color="#E53935" />
            <Text style={styles.historyDetails}>Carregando histórico...</Text>
          </View>
        ) : erroHistorico ? (
          <View style={styles.historyStatus}>
            <Text style={styles.historyDetails}>{erroHistorico}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => setAtualizacaoHistorico(valor => valor + 1)}>
              <Text style={styles.editText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : historico.registros.length === 0 ? (
          <Text style={styles.historyDetails}>Nenhuma manutenção registrada para esta moto.</Text>
        ) : historico.registros.map(registro => (
          <View key={registro.id} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyCategory}>{registro.categoria || 'Geral'}</Text>
              <Text style={styles.historyDate}>{registro.data || 'Data não informada'}</Text>
            </View>
            {registro.categoria !== 'Seguro' && registro.categoria !== 'Documentos' && registro.km != null && registro.km !== '' ? (
              <Text style={styles.historyDetails}>Hodômetro: {registro.km} km</Text>
            ) : null}
            {registro.oficina ? <Text style={styles.historyDetails}>Local: {registro.oficina}</Text> : null}
            {registro.categoria === 'Óleo' && registro.marcaOleo ? (
              <Text style={styles.historyDetails}>Óleo: {registro.marcaOleo}</Text>
            ) : null}
            {registro.categoria === 'Óleo' && registro.viscosidadeOleo ? (
              <Text style={styles.historyDetails}>Viscosidade registrada: {registro.viscosidadeOleo}</Text>
            ) : null}
            {registro.dataVencimento ? <Text style={styles.historyDetails}>Vencimento: {registro.dataVencimento}</Text> : null}
            {registro.observacoes ? <Text style={styles.historyDetails}>Obs: {registro.observacoes}</Text> : null}
            <View style={styles.historyActions}>
              <TouchableOpacity
                style={[styles.historyAction, acaoEmCurso && styles.actionDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${registro.categoria || 'manutenção'} de ${registro.data || 'data não informada'}`}
                disabled={acaoEmCurso}
                onPress={() => handleEditar(registro)}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color="#FFFFFF" />
                <Text style={styles.editText}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.historyAction, acaoEmCurso && styles.actionDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Excluir ${registro.categoria || 'manutenção'} de ${registro.data || 'data não informada'}`}
                disabled={acaoEmCurso}
                onPress={() => handleExcluir(registro)}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#E53935" />
                <Text style={styles.deleteText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {acaoEmCurso ? <ActivityIndicator color="#E53935" style={styles.historyStatus} /> : null}

      </ScrollView>

      {/* Modal para Escolher a Moto */}
      <Modal
        visible={modalMotosVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalMotosVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Selecionar Moto</Text>
            
            <FlatList
              data={motos}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setMotoSelecionada(item);
                    setModalMotosVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>
                    {item.marca} {item.modelo} {item.apelido ? `("${item.apelido}")` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setModalMotosVisible(false)}
            >
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { height: 220, width: '100%' },
  headerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'space-between', paddingTop: 10 },
  topBar: { flexDirection: 'row', paddingHorizontal: 16 },
  backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { color: '#E53935', fontSize: 32, fontWeight: 'bold' },
  headerTexts: { paddingHorizontal: 24, paddingBottom: 32 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  redLine: { width: 32, height: 3, backgroundColor: '#E53935', marginTop: 8 },
  subtitle: { color: '#AAAAAA', fontSize: 14, marginTop: 8 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionTitle: { color: '#AAAAAA', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.2, marginTop: 16 },
  spinnerContainer: { backgroundColor: '#1A1A1A', borderRadius: 8, height: 56, marginTop: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#2C2C2C' },
  spinnerText: { color: '#FFFFFF', fontSize: 14, flex: 1, marginRight: 8 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryCard: { backgroundColor: '#1A1A1A', width: '31%', aspectRatio: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2C', padding: 8 },
  categoryIcon: { width: 40, height: 40, marginBottom: 8 },
  categoryName: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  historyStatus: { paddingVertical: 12, alignItems: 'center', gap: 8 },
  historyCard: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2C2C2C', borderRadius: 12, padding: 16, marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  historyCategory: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  historyDate: { color: '#AAAAAA', fontSize: 13 },
  historyDetails: { color: '#AAAAAA', fontSize: 14, lineHeight: 20, marginBottom: 4 },
  historyActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  historyAction: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#3C3C3C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  deleteText: { color: '#E53935', fontSize: 14, fontWeight: 'bold' },
  actionDisabled: { opacity: 0.5 },
  retryButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#2C2C2C', maxHeight: '60%' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },
  modalItemText: { color: '#FFFFFF', fontSize: 16 },
  modalCloseButton: { marginTop: 16, backgroundColor: '#E53935', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { color: '#FFFFFF', fontWeight: 'bold' },
});
