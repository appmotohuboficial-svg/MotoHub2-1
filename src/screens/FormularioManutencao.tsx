import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ImageBackground,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, doc, getDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, auth } from '../services/firebase';

import { dataLocal } from '../utils/datas';

export function FormularioManutencao({ route, navigation }: any) {
  const registro = route?.params?.registro;
  const trava = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const categoriaSelecionada = route?.params?.categoria || registro?.categoria || 'Geral';
  const motoId = route?.params?.motoId; // ID da moto passada por parâmetro

  const isAdministrativo = categoriaSelecionada === 'Seguro' || categoriaSelecionada === 'Documentos';

  // Estados de Data com Objeto Date para o Calendário Nativo
  const [data, setData] = useState(dataLocal(registro?.data) || new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [dataVencimento, setDataVencimento] = useState(dataLocal(registro?.dataVencimento) || new Date());
  const [showVencimentoPicker, setShowVencimentoPicker] = useState(false);

  const [observacoes, setObservacoes] = useState(String(registro?.observacoes ?? ''));
  
  // Estados Mecânicos
  const [km, setKm] = useState(String(registro?.km ?? ''));
  const [oficina, setOficina] = useState(String(registro?.oficina ?? ''));
  const [trocouFiltro, setTrocouFiltro] = useState(!!registro?.trocouFiltro);
  const [marcaOleo, setMarcaOleo] = useState(String(registro?.marcaOleo ?? ''));
  const [viscosidadeOleo, setViscosidadeOleo] = useState(String(registro?.viscosidadeOleo ?? ''));
  const [viscosidadeRecomendada, setViscosidadeRecomendada] = useState('');
  const [carregandoFicha, setCarregandoFicha] = useState(categoriaSelecionada === 'Óleo');
  const [erroFicha, setErroFicha] = useState('');
  const [tentativaFicha, setTentativaFicha] = useState(0);
  const viscosidadeAlterada = useRef(false);
  const [posicao, setPosicao] = useState(String(registro?.posicao ?? ''));
  const [marcaPeca, setMarcaPeca] = useState(String(registro?.marcaPeca ?? ''));

  // Estados Administrativos
  const [seguradora, setSeguradora] = useState(String(registro?.seguradora ?? ''));
  const [apolice, setApolice] = useState(String(registro?.apolice ?? ''));
  const [tipoDoc, setTipoDoc] = useState(String(registro?.tipoDoc ?? ''));
  const [anoExercicio, setAnoExercicio] = useState(String(registro?.anoExercicio ?? ''));
  const [valorPago, setValorPago] = useState(String(registro?.valorPago ?? ''));
  const [formaPagamento, setFormaPagamento] = useState(String(registro?.formaPagamento ?? ''));

  useEffect(() => {
    if (categoriaSelecionada !== 'Óleo') return;
    let ativo = true;

    const carregarFicha = async () => {
      setCarregandoFicha(true);
      setErroFicha('');
      setViscosidadeRecomendada('');
      try {
        const userId = auth.currentUser?.uid;
        if (!motoId || !userId) throw new Error('Selecione uma moto da sua conta.');
        const moto = await getDoc(doc(db, 'motos', motoId));
        if (!moto.exists() || moto.data().userId !== userId || auth.currentUser?.uid !== userId) {
          throw new Error('Sem permissão para esta moto.');
        }
        if (!ativo) return;
        const recomendada = String(moto.data().viscosidade ?? '').trim();
        setViscosidadeRecomendada(recomendada);
        // A especificação atual não deve reescrever o histórico nem a digitação do usuário.
        if (!registro?.id && !viscosidadeAlterada.current) setViscosidadeOleo(recomendada);
      } catch (error) {
        if (ativo) setErroFicha('Não foi possível carregar a viscosidade da ficha técnica.');
      } finally {
        if (ativo) setCarregandoFicha(false);
      }
    };

    carregarFicha();
    return () => { ativo = false; };
  }, [motoId, categoriaSelecionada, registro?.id, tentativaFicha]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR');
  };

  const handleSalvarManutencao = async () => {
    if (trava.current || (categoriaSelecionada === 'Óleo' && carregandoFicha)) return;
    if (!motoId) {
      Alert.alert('Atenção', 'Nenhuma moto vinculada. Volte e selecione uma moto.');
      return;
    }
    const userId = auth.currentUser?.uid;
    if (!userId) {
      Alert.alert('Atenção', 'Entre na sua conta para salvar a manutenção.');
      return;
    }
    if (registro?.motoId && registro.motoId !== motoId) {
      Alert.alert('Atenção', 'Este registro não pertence à moto selecionada.');
      return;
    }

    trava.current = true; setSalvando(true);
    try {
      const dadosManutencao = {
        motoId,
        categoria: categoriaSelecionada,
        data: formatDate(data),
        km: km || '0',
        oficina,
        observacoes,
        trocouFiltro,
        marcaOleo,
        // Em registros antigos, mantenha o campo ausente até o usuário informá-lo.
        ...(categoriaSelecionada === 'Óleo' && (!registro?.id || registro?.viscosidadeOleo != null || viscosidadeAlterada.current)
          ? { viscosidadeOleo: viscosidadeOleo.trim() } : {}),
        posicao,
        marcaPeca,
        seguradora,
        apolice,
        tipoDoc,
        anoExercicio,
        valorPago,
        dataVencimento: isAdministrativo ? formatDate(dataVencimento) : '',
        formaPagamento,
        updatedAt: serverTimestamp(),
      };

      const motoRef = doc(db, 'motos', motoId);
      const registroRef = registro?.id ? doc(db, 'motos', motoId, 'manutencoes', registro.id)
        : doc(collection(db, 'motos', motoId, 'manutencoes'));
      await runTransaction(db, async tx => {
        const moto = await tx.get(motoRef);
        const anterior = registro?.id ? await tx.get(registroRef) : null;
        if (!moto.exists() || auth.currentUser?.uid !== userId || moto.data().userId !== userId) throw new Error('Sem permissão para esta moto.');
        if (registro?.id && !anterior?.exists()) throw new Error('Registro não encontrado.');
        if (anterior?.data()?.motoId && anterior.data()?.motoId !== motoId) throw new Error('Este registro não pertence à moto selecionada.');
        if (registro?.id) tx.update(registroRef, dadosManutencao);
        else tx.set(registroRef, { ...dadosManutencao, createdAt: serverTimestamp() });
        // Corrigir um registro antigo não deve reduzir o hodômetro atual.
        if (!registro?.id && km) tx.update(motoRef, { hodometro: km });
      });

      Alert.alert('Sucesso', `${categoriaSelecionada} registrada com sucesso!`, [
        { text: 'OK', onPress: () => navigation?.goBack() }
      ]);
    } catch (error: any) {
      Alert.alert('Erro', 'Não foi possível salvar: ' + error.message);
    } finally { trava.current = false; setSalvando(false); }
  };

  const renderPillSelector = (opcoes: string[], stateAtual: string, setState: (val: string) => void) => (
    <View style={styles.pillContainer}>
      {opcoes.map((opcao) => (
        <TouchableOpacity
          key={opcao}
          style={[styles.pill, stateAtual === opcao && styles.pillActive]}
          onPress={() => setState(opcao)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, stateAtual === opcao && styles.pillTextActive]}>
            {opcao}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCamposDinamicos = () => {
    switch (categoriaSelecionada) {
      case 'Óleo':
        return (
          <View style={styles.dynamicFieldsContainer}>
            <Text style={styles.labelNotes}>VISCOSIDADE RECOMENDADA NA FICHA TÉCNICA</Text>
            <Text style={styles.recommendationText}>
              {carregandoFicha ? 'Carregando...' : erroFicha || viscosidadeRecomendada || 'Não cadastrada na ficha técnica.'}
            </Text>
            {!!erroFicha && (
              <TouchableOpacity onPress={() => setTentativaFicha(valor => valor + 1)} accessibilityRole="button">
                <Text style={styles.retryText}>Tentar novamente</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.labelNotes}>VISCOSIDADE DO ÓLEO UTILIZADO</Text>
            <TextInput
              style={styles.input}
              placeholder={registro?.id ? 'Não informada neste registro' : 'Ex: 10W40'}
              placeholderTextColor="#777"
              accessibilityLabel="Viscosidade do óleo utilizado"
              value={viscosidadeOleo}
              onChangeText={valor => {
                viscosidadeAlterada.current = true;
                setViscosidadeOleo(valor);
              }}
            />
            {!!registro?.id && registro?.viscosidadeOleo == null && (
              <Text style={styles.helperText}>
                A viscosidade não foi registrada separadamente. O texto original da marca foi mantido; confira-o antes de preencher.
              </Text>
            )}
            <Text style={styles.labelNotes}>MARCA DO ÓLEO</Text>
            <TextInput
              style={styles.input}
              placeholder="Marca do óleo (Ex: Motul 7100)"
              placeholderTextColor="#777"
              accessibilityLabel="Marca do óleo"
              value={marcaOleo}
              onChangeText={setMarcaOleo}
            />
            <TouchableOpacity 
              style={styles.checkboxContainer} 
              onPress={() => setTrocouFiltro(!trocouFiltro)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons 
                name={trocouFiltro ? "checkbox-marked" : "checkbox-blank-outline"} 
                size={24} 
                color={trocouFiltro ? "#E53935" : "#AAAAAA"} 
              />
              <Text style={styles.checkboxLabel}>Houve troca do filtro de óleo?</Text>
            </TouchableOpacity>
          </View>
        );

      case 'Pneu':
      case 'Freios':
        return (
          <View style={styles.dynamicFieldsContainer}>
            <Text style={styles.labelNotes}>QUAL RODA?</Text>
            {renderPillSelector(['Dianteiro', 'Traseiro', 'Ambos'], posicao, setPosicao)}
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder={categoriaSelecionada === 'Pneu' ? "Marca e Modelo do Pneu" : "Serviço (Ex: Pastilhas, Disco)"}
              placeholderTextColor="#777"
              value={marcaPeca}
              onChangeText={setMarcaPeca}
            />
          </View>
        );

      case 'Seguro':
        return (
          <View style={styles.dynamicFieldsContainer}>
            <TextInput
              style={styles.input}
              placeholder="Nome da Seguradora (Ex: Suhai, Porto)"
              placeholderTextColor="#777"
              value={seguradora}
              onChangeText={setSeguradora}
            />
            <TextInput
              style={styles.input}
              placeholder="Número da Apólice"
              placeholderTextColor="#777"
              value={apolice}
              onChangeText={setApolice}
            />
            
            <TouchableOpacity 
              style={styles.dateButton} 
              onPress={() => setShowVencimentoPicker(true)}
            >
              <Text style={styles.dateButtonText}>Vencimento: {formatDate(dataVencimento)}</Text>
              <MaterialCommunityIcons name="calendar" size={20} color="#E53935" />
            </TouchableOpacity>
            {showVencimentoPicker && (
              <DateTimePicker
                value={dataVencimento}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowVencimentoPicker(false);
                  if (selectedDate) setDataVencimento(selectedDate);
                }}
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Valor Pago (R$)"
              placeholderTextColor="#777"
              keyboardType="numeric"
              value={valorPago}
              onChangeText={setValorPago}
            />
            <TextInput
              style={styles.input}
              placeholder="Forma de Pgto (Ex: Boleto Mensal, Débito)"
              placeholderTextColor="#777"
              value={formaPagamento}
              onChangeText={setFormaPagamento}
            />
          </View>
        );

      case 'Documentos':
        return (
          <View style={styles.dynamicFieldsContainer}>
            <Text style={styles.labelNotes}>TIPO DE DOCUMENTO</Text>
            {renderPillSelector(['IPVA', 'Licenciamento', 'Multa'], tipoDoc, setTipoDoc)}
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Ano de Exercício (Ex: 2024)"
              placeholderTextColor="#777"
              keyboardType="numeric"
              value={anoExercicio}
              onChangeText={setAnoExercicio}
            />
            
            <TouchableOpacity 
              style={styles.dateButton} 
              onPress={() => setShowVencimentoPicker(true)}
            >
              <Text style={styles.dateButtonText}>Vencimento: {formatDate(dataVencimento)}</Text>
              <MaterialCommunityIcons name="calendar" size={20} color="#E53935" />
            </TouchableOpacity>
            {showVencimentoPicker && (
              <DateTimePicker
                value={dataVencimento}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowVencimentoPicker(false);
                  if (selectedDate) setDataVencimento(selectedDate);
                }}
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Valor Pago (R$)"
              placeholderTextColor="#777"
              keyboardType="numeric"
              value={valorPago}
              onChangeText={setValorPago}
            />
          </View>
        );

      default:
        return null; 
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <ImageBackground 
          source={require('../../assets/banner.webp')} 
          style={styles.header}
          imageStyle={{ opacity: 0.8 }}
        >
          <View style={styles.headerOverlay}>
            <View style={styles.topBar}>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
                <Text style={styles.backButtonText}>&lt;</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.headerTexts}>
              <Text style={styles.title}>{categoriaSelecionada}</Text>
              <View style={styles.redLine} />
              <Text style={styles.subtitle}>Registro de atividade</Text>
            </View>
          </View>
        </ImageBackground>

        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          
          <Text style={styles.sectionTitle}>{isAdministrativo ? 'DADOS DO REGISTRO' : 'DADOS BÁSICOS'}</Text>

          {/* Botão Calendário para Data */}
          <TouchableOpacity 
            style={styles.dateButton} 
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>Data: {formatDate(data)}</Text>
            <MaterialCommunityIcons name="calendar" size={20} color="#E53935" />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={data}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) setData(selectedDate);
              }}
            />
          )}

          {!isAdministrativo && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Hodômetro (KM)"
                placeholderTextColor="#777"
                keyboardType="numeric"
                value={km}
                onChangeText={setKm}
              />
              <TextInput
                style={styles.input}
                placeholder="Oficina / Local"
                placeholderTextColor="#777"
                value={oficina}
                onChangeText={setOficina}
              />
            </>
          )}

          {renderCamposDinamicos()}

          <Text style={styles.labelNotes}>OBSERVAÇÕES ADICIONAIS</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Detalhes adicionais..."
            placeholderTextColor="#777"
            multiline={true}
            numberOfLines={4}
            textAlignVertical="top"
            value={observacoes}
            onChangeText={setObservacoes}
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleSalvarManutencao} disabled={salvando || (categoriaSelecionada === 'Óleo' && carregandoFicha)} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>{salvando ? 'SALVANDO...' : categoriaSelecionada === 'Óleo' && carregandoFicha ? 'CARREGANDO FICHA...' : registro?.id ? 'SALVAR ALTERAÇÕES' : 'SALVAR REGISTRO'}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { height: 220, width: '100%' },
  headerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'space-between', paddingTop: 10 },
  topBar: { flexDirection: 'row', paddingHorizontal: 16 },
  backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { color: '#E53935', fontSize: 32, fontWeight: 'bold' },
  headerTexts: { paddingHorizontal: 24, paddingBottom: 32 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  redLine: { width: 32, height: 3, backgroundColor: '#E53935', marginTop: 8 },
  subtitle: { color: '#AAAAAA', fontSize: 14, marginTop: 8 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  sectionTitle: { color: '#E53935', fontSize: 12, fontWeight: 'bold', marginTop: 24, marginBottom: 16 },
  input: { backgroundColor: '#1A1A1A', borderRadius: 8, height: 56, paddingHorizontal: 16, color: '#FFFFFF', fontSize: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2C' },
  dateButton: { backgroundColor: '#1A1A1A', borderRadius: 8, height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2C' },
  dateButtonText: { color: '#FFFFFF', fontSize: 14 },
  dynamicFieldsContainer: { marginTop: 8, marginBottom: 8 },
  recommendationText: { color: '#FFFFFF', fontSize: 14, marginBottom: 12 },
  helperText: { color: '#AAAAAA', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  retryText: { color: '#E53935', fontSize: 14, fontWeight: 'bold', paddingVertical: 8, marginBottom: 8 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  checkboxLabel: { color: '#FFFFFF', fontSize: 14, marginLeft: 12 },
  labelNotes: { color: '#AAAAAA', fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 8 },
  pillContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  pill: { flex: 1, height: 44, backgroundColor: '#1A1A1A', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2C', marginHorizontal: 4 },
  pillActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  pillText: { color: '#AAAAAA', fontSize: 13, fontWeight: 'bold' },
  pillTextActive: { color: '#FFFFFF' },
  textArea: { backgroundColor: '#1A1A1A', borderRadius: 8, minHeight: 100, padding: 16, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2C2C2C' },
  btnPrimary: { height: 64, backgroundColor: '#E53935', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});
