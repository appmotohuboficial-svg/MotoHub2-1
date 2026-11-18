import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { useSalvarMoto } from '../hooks/useSalvarMoto';

export function DadosTecnicos({ navigation, route }: any) {
  const anteriores = route?.params?.dadosTecnicos || {};
  const [tipoOleo, setTipoOleo] = useState(anteriores.tipoOleo || 'Mineral');
  const [viscosidade, setViscosidade] = useState(anteriores.viscosidade || '');
  const [pressaoDianteira, setPressaoDianteira] = useState(anteriores.pressaoDianteira || '');
  const [pressaoTraseira, setPressaoTraseira] = useState(anteriores.pressaoTraseira || '');
  const [tipoCombustivel, setTipoCombustivel] = useState(anteriores.tipoCombustivel || 'Comum');
  const [capacidadeTanque, setCapacidadeTanque] = useState(anteriores.capacidadeTanque || '');
  const [fluidoFreio, setFluidoFreio] = useState(anteriores.fluidoFreio || 'DOT 4');
  const [filtroAr, setFiltroAr] = useState(anteriores.filtroAr || 'Convencional');
  const { salvar, salvando } = useSalvarMoto(navigation);

  const dadosTecnicos = { tipoOleo, viscosidade, pressaoDianteira, pressaoTraseira,
    tipoCombustivel, capacidadeTanque, fluidoFreio, filtroAr };

  // Atualiza somente o rascunho da tela original, inclusive ao voltar pelo Android.
  // Não navega, não cria outra tela e não grava nada no banco enquanto se digita.
  useEffect(() => {
    const source = route?.params?.cadastroRouteKey;
    if (!source) return;
    navigation.dispatch({
      ...CommonActions.setParams({ dadosTecnicos: { tipoOleo, viscosidade, pressaoDianteira,
        pressaoTraseira, tipoCombustivel, capacidadeTanque, fluidoFreio, filtroAr } }),
      source,
    });
  }, [navigation, route?.params?.cadastroRouteKey, tipoOleo, viscosidade, pressaoDianteira,
    pressaoTraseira, tipoCombustivel, capacidadeTanque, fluidoFreio, filtroAr]);

  const handleSalvarFicha = () => salvar(route?.params?.cadastro, dadosTecnicos);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()} disabled={salvando}>
          <Text style={styles.backButtonText}>&lt;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FICHA TÉCNICA</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* MOTOR E LUBRIFICANTES */}
        <Text style={styles.sectionTitle}>MOTOR E LUBRIFICANTES</Text>
        <View style={styles.radioRow}>
          {['Mineral', 'Semi-sint.', 'Sintético'].map((item) => (
            <TouchableOpacity key={item} style={styles.radioOption} onPress={() => setTipoOleo(item)}>
              <View style={styles.radioCircle}>
                {tipoOleo === item && <View style={styles.radioSelected} />}
              </View>
              <Text style={styles.radioText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>VISCOSIDADE DO ÓLEO</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 10W40"
          placeholderTextColor="#777"
          value={viscosidade}
          onChangeText={setViscosidade}
        />

        {/* PNEUS */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>PRESSÃO DOS PNEUS (PSI)</Text>
        <View style={styles.rowInputs}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Dianteira (psi)"
            placeholderTextColor="#777"
            keyboardType="numeric"
            value={pressaoDianteira}
            onChangeText={setPressaoDianteira}
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Traseira (psi)"
            placeholderTextColor="#777"
            keyboardType="numeric"
            value={pressaoTraseira}
            onChangeText={setPressaoTraseira}
          />
        </View>

        {/* COMBUSTÍVEL */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>COMBUSTÍVEL</Text>
        <View style={styles.radioRow}>
          {['Comum', 'Aditiv.', 'Premium'].map((item) => (
            <TouchableOpacity key={item} style={styles.radioOption} onPress={() => setTipoCombustivel(item)}>
              <View style={styles.radioCircle}>
                {tipoCombustivel === item && <View style={styles.radioSelected} />}
              </View>
              <Text style={styles.radioText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>CAPACIDADE DO TANQUE (L)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 16"
          placeholderTextColor="#777"
          keyboardType="numeric"
          value={capacidadeTanque}
          onChangeText={setCapacidadeTanque}
        />

        {/* FLUIDO DE FREIO */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>FLUIDO DE FREIO</Text>
        <View style={styles.radioRow}>
          {['DOT 3', 'DOT 4', 'DOT 5'].map((item) => (
            <TouchableOpacity key={item} style={styles.radioOption} onPress={() => setFluidoFreio(item)}>
              <View style={styles.radioCircle}>
                {fluidoFreio === item && <View style={styles.radioSelected} />}
              </View>
              <Text style={styles.radioText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* FILTRO DE AR */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>FILTRO DE AR</Text>
        <View style={styles.radioRow}>
          {['Convencional', 'Lavável'].map((item) => (
            <TouchableOpacity key={item} style={styles.radioOption} onPress={() => setFiltroAr(item)}>
              <View style={styles.radioCircle}>
                {filtroAr === item && <View style={styles.radioSelected} />}
              </View>
              <Text style={styles.radioText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btnPrimary} onPress={handleSalvarFicha} disabled={salvando}>
          <Text style={styles.btnPrimaryText}>{salvando ? 'SALVANDO...' : 'SALVAR MOTO NA GARAGEM'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },
  backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'flex-start' },
  backButtonText: { color: '#E53935', fontSize: 28, fontWeight: 'bold' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  scrollContent: { padding: 24, paddingBottom: 40 },
  sectionTitle: { color: '#E53935', fontSize: 12, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  label: { color: '#AAAAAA', fontSize: 10, fontWeight: 'bold', marginTop: 12 },
  radioRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  radioOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#E53935', justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  radioSelected: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E53935' },
  radioText: { color: '#FFFFFF', fontSize: 12 },
  input: { backgroundColor: '#1A1A1A', borderRadius: 8, height: 56, paddingHorizontal: 16, color: '#FFFFFF', fontSize: 14, marginTop: 4, borderWidth: 1, borderColor: '#2C2C2C' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },
  btnPrimary: { height: 64, backgroundColor: '#E53935', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});
