import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from './firebase';

const functions = () => getFunctions(auth.app, 'southamerica-east1');
export type StatusMotoclube = 'nenhum' | 'pendente' | 'membro' | 'desligamento_pendente';
export interface PerfilClube { userId: string; nome: string; fotoUrl: string; cidade: string; motoclubeId: string | null }
export async function acaoMotoclube(acao: string, dados: Record<string, unknown> = {}) {
  return (await httpsCallable(functions(), 'motoclubeAcao')({acao, ...dados})).data;
}
export async function perfisMotoclube(motoclubeId: string, userIds: string[]) {
  const profiles: PerfilClube[] = [];
  for (let i = 0; i < userIds.length; i += 50) {
    const result = await httpsCallable<unknown, PerfilClube[]>(functions(), 'motoclubePerfis')({motoclubeId, userIds: userIds.slice(i, i + 50)});
    profiles.push(...result.data);
  }
  return profiles;
}
