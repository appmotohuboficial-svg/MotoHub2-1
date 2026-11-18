import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { uploadLocalImage } from '../services/imageUpload';

export interface CadastroMoto {
  marca: string;
  modelo: string;
  apelido: string;
  ano: string;
  hodometro: string;
  fotoUri: string | null;
}

export function validarCadastroMoto(cadastro?: CadastroMoto): string | null {
  if (!cadastro?.marca.trim() || !cadastro.modelo.trim() || !cadastro.hodometro.trim()) {
    return 'Preencha ao menos Marca, Modelo e KM Atual no cadastro básico.';
  }
  const km = Number(cadastro.hodometro.trim().replace(',', '.'));
  return !Number.isFinite(km) || km < 0 ? 'Informe uma quilometragem válida.' : null;
}

// A mesma gravação atende o cadastro básico e a ficha técnica.
export function useSalvarMoto(navigation: any) {
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const trava = useRef(false);
  const gravado = useRef(false);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => { ativo.current = false; };
  }, []);
  usePreventRemove(salvando, () => {
    Alert.alert('Salvando', 'Aguarde a conclusão do cadastro.');
  });
  useEffect(() => {
    if (concluido && !salvando) navigation.popTo('Garagem');
  }, [concluido, salvando, navigation]);

  const salvar = async (cadastro?: CadastroMoto, ficha: Record<string, string> = {}, semFoto = false) => {
    if (!ativo.current || trava.current || gravado.current) return;
    const erroValidacao = validarCadastroMoto(cadastro);
    if (erroValidacao || !cadastro) {
      Alert.alert('Atenção', erroValidacao || 'Volte ao cadastro básico para preencher os dados da moto.');
      return;
    }
    const userId = auth.currentUser?.uid;
    if (!userId) {
      Alert.alert('Erro', 'Você precisa estar logado para cadastrar uma moto.');
      return;
    }

    trava.current = true;
    setSalvando(true);
    let enviandoFoto = false;
    try {
      let fotoUrl = '';
      if (cadastro.fotoUri && !semFoto) {
        enviandoFoto = true;
        fotoUrl = await uploadLocalImage(cadastro.fotoUri, `usuarios/${userId}/motos/${Date.now()}.jpg`);
        enviandoFoto = false;
      }
      if (auth.currentUser?.uid !== userId) throw new Error('Sua sessão mudou. Entre novamente para salvar.');
      // Mantém os campos técnicos no formato já utilizado pela ficha e manutenção.
      const dadosTecnicos: Record<string, string> = {};
      for (const campo of ['tipoOleo', 'viscosidade', 'pressaoDianteira', 'pressaoTraseira',
        'tipoCombustivel', 'capacidadeTanque', 'fluidoFreio', 'filtroAr']) {
        if (typeof ficha[campo] === 'string') dadosTecnicos[campo] = ficha[campo].trim();
      }
      await addDoc(collection(db, 'motos'), {
        ...dadosTecnicos,
        userId,
        marca: cadastro.marca.trim(), modelo: cadastro.modelo.trim(),
        apelido: cadastro.apelido.trim(), ano: cadastro.ano.trim(),
        hodometro: Number(cadastro.hodometro.trim().replace(',', '.')),
        fotoUri: fotoUrl, createdAt: new Date(),
      });
      gravado.current = true;
      if (ativo.current) setConcluido(true);
    } catch (error: any) {
      if (!ativo.current) return;
      if (enviandoFoto) {
        const mensagem = error?.code === 'storage/quota-exceeded'
          ? 'O serviço de fotos atingiu a cota do projeto. Isso não é um limite de motos na garagem.'
          : 'Não foi possível enviar a foto agora.';
        Alert.alert('Foto não enviada', `${mensagem} Seus dados continuam preenchidos. Deseja salvar a moto sem foto?`, [
          { text: 'Manter e tentar depois', style: 'cancel' },
          { text: 'Salvar sem foto', onPress: () => {
            if (auth.currentUser?.uid !== userId) {
              Alert.alert('Erro', 'Sua sessão mudou. Entre novamente para salvar.');
              return;
            }
            return salvar(cadastro, ficha, true);
          } },
        ]);
      } else {
        Alert.alert('Erro', 'Não foi possível salvar a moto: ' + (error?.message || 'Tente novamente.'));
      }
    } finally {
      trava.current = false;
      if (ativo.current) setSalvando(false);
    }
  };
  return { salvar, salvando };
}
