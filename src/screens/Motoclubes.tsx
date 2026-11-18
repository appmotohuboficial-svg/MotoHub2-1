import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomNav } from '../components/BottomNav';
import { BottomSheetMenu } from '../components/BottomSheetMenu';

const recursos = [
  { icone: '🏍️', titulo: 'Perfil do Motoclube', descricao: 'Nome, brasão, cidade, estado, história e informações oficiais do clube.' },
  { icone: '👥', titulo: 'Membros e vínculos', descricao: 'Motociclistas poderão identificar o motoclube ao qual pertencem e fazer parte da sua comunidade dentro do MotoHub.' },
  { icone: '📅', titulo: 'Eventos e encontros', descricao: 'Divulgação de encontros, aniversários, ações, viagens e eventos promovidos pelo motoclube.' },
  { icone: '📢', titulo: 'Comunicação oficial', descricao: 'Diretoria e pessoas autorizadas poderão administrar e divulgar informações do clube.' },
  { icone: '🌎', titulo: 'Encontre outros motoclubes', descricao: 'Conheça motoclubes de outras cidades e regiões e descubra quem faz parte da estrada.' },
  { icone: '🔐', titulo: 'Identidade e segurança', descricao: 'Estamos desenvolvendo um sistema de validação para que a administração de cada perfil seja vinculada a representantes autorizados pelo próprio motoclube.' },
];

export function Motoclubes({ navigation }: any) {
  const [menuVisible, setMenuVisible] = useState(false);
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Voltar">
          <MaterialCommunityIcons name="chevron-left" size={30} color="#E53935" />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.title}>MOTOCLUBES</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.subtitle}>Sua irmandade também terá espaço no MotoHub.</Text>
        <Text style={styles.description}>
          Estamos preparando uma área dedicada aos motoclubes, criada para reunir sua identidade, sua história e sua presença dentro da comunidade motociclista.
        </Text>

        <View style={styles.features}>
          {recursos.map(recurso => (
            <View key={recurso.titulo} style={styles.feature}>
              <Text accessible={false} style={styles.featureIcon}>{recurso.icone}</Text>
              <View style={styles.featureContent}>
                <Text accessibilityRole="header" style={styles.featureTitle}>{recurso.titulo}</Text>
                <Text style={styles.description}>{recurso.descricao}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.development}>
          <Text accessibilityRole="header" style={styles.badge}>EM DESENVOLVIMENTO</Text>
          <Text style={styles.description}>
            O espaço <Text style={styles.emphasis}>Motoclubes</Text> está sendo preparado para uma próxima atualização do MotoHub.
          </Text>
          <Text style={styles.description}>
            Queremos fazer isso do jeito certo: preservando a identidade de cada clube e garantindo que as informações publicadas representem realmente quem está por trás de cada brasão.
          </Text>
          <Text style={styles.closing}>Em breve, seu motoclube também poderá fazer parte do MotoHub.</Text>
        </View>

        <View style={styles.signature}>
          <Text style={styles.brand}>MotoHub</Text>
          <Text style={styles.tagline}>Mais que um app. A estrada que nos conecta.</Text>
        </View>
      </ScrollView>
      <BottomNav state={{ routes: [{ name: 'Motoclubes' }], index: 0 }} navigation={navigation} onPressFab={() => setMenuVisible(true)} />
      <BottomSheetMenu visible={menuVisible} onClose={() => setMenuVisible(false)}
        onSelectNovaManutencao={() => navigation.navigate('Manutencao')}
        onSelectNovoEvento={() => navigation.navigate('Eventos')}
        onSelectNovaViagem={() => navigation.navigate('Viagens')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },
  backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginLeft: 8 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 150 },
  subtitle: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', lineHeight: 30 },
  description: { color: '#BBBBBB', fontSize: 15, lineHeight: 23, marginTop: 10 },
  features: { marginTop: 28 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  featureIcon: { fontSize: 24, width: 36, marginRight: 12 },
  featureContent: { flex: 1 },
  featureTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold', lineHeight: 24 },
  development: { borderTopWidth: 1, borderTopColor: '#333333', paddingTop: 24, marginTop: 4 },
  badge: { color: '#F76B67', fontSize: 18, fontWeight: 'bold', lineHeight: 26, marginBottom: 4 },
  emphasis: { color: '#FFFFFF', fontWeight: 'bold' },
  closing: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, fontWeight: 'bold', marginTop: 20 },
  signature: { marginTop: 32 },
  brand: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  tagline: { color: '#AAAAAA', fontSize: 14, fontStyle: 'italic', lineHeight: 22, marginTop: 6 },
});
