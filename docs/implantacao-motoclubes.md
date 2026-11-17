# Melhorias aprovadas — Manutenção, Viagem, Evento e Motoclubes

Implementação local preparada em 31/10/2026. Não inclui publicação no Firebase ou alterações no GitHub.

## Comportamento entregue

- Manutenção: tocar em um registro do histórico da moto abre o formulário preenchido. Salvar altera o mesmo documento, preserva `createdAt` e verifica a propriedade da moto. Registro antigo não altera o hodômetro atual. Inclusões continuam atualizando o hodômetro na mesma transação do registro.
- Viagem: o proprietário encontra **Editar roteiro** nos detalhes, corrige os dados no formulário existente e confirma no resumo com o traçado recalculado. O ID e `createdAt` são preservados; campos legados não editados são mantidos.
- Evento: o responsável encontra **Editar evento** nos detalhes. O formulário recupera campos, estruturas e horários; atualiza expiração e mantém o flyer quando não há nova imagem. A imagem anterior só é removida depois de gravar sua substituição. Detalhes acompanham as atualizações.
- Perfil → **Meu Moto Clube** → lista → página do clube. A navegação inferior e o menu existentes foram preservados.
- Cadastro de clube com todos os campos solicitados e seleção de brasão da galeria, convertido para JPEG. Criador vira responsável, sem filiação automática.
- Amizade independente em vários clubes; solicitação, cancelamento, aprovação, recusa; administração de membros; desligamento solicitado; conclusão e remoção direta; histórico privado.

## Modelagem

`usuarios/{uid}` conserva seus dados privados e recebe:

- `motoclubeId`: nulo até aprovação; mantém o ID durante `desligamento_pendente`.
- `statusMotoclube`: `nenhum`, `pendente`, `membro` ou `desligamento_pendente`.
- `solicitacaoMotoclubeId`: identifica o único pedido ativo enquanto não há vínculo oficial. Cancelar ou recusar libera outro pedido. Não permite pedidos simultâneos.
- `motoclubeNome` não é duplicado. O nome é consultado no documento do clube; a saída limpa eventual campo legado.

`motoclubes/{id}` contém os campos públicos do cadastro, `criadorUserId`, `responsavelUserId`, timestamps e listas `membrosIds`/`amigosIds`, compostas somente de UIDs.

Subcoleções por clube:

- `solicitacoes/{uid}`: ID determinístico impede duplicação de pedido ativo. Campos `id`, `userId`, `motoclubeId`, `status`, `solicitadoEm`, `respondidoEm`, `respondidoPor`. Novo pedido após recusa/cancelamento substitui esse registro.
- `membros/{uid}`: UID, data de entrada e situação; leitura do próprio membro ou responsável.
- `historico/{id}`: UID, entrada, saída, classificação, motivo e responsável pela remoção; leitura exclusiva do responsável atual.
- `privado/cadastro`: CNPJ opcional, sem máscara, restrito ao responsável. O documento público só recebe `cnpjPublico` mediante `exibirCnpjPublicamente: true`, cujo padrão é `false`.

`motoclubeAcao` é uma callable autenticada em `southamerica-east1`. Todas as mutações do módulo passam por ela. A transação revalida o responsável, o estado da solicitação e o vínculo atual do usuário antes de gravar usuário, listas, metadados e histórico juntos. Concorrência no mesmo usuário força nova leitura e bloqueia segundo vínculo.

`motoclubePerfis` consulta `usuarios/{uid}` no servidor e retorna somente UID, nome, foto, cidade e vínculo publicamente visível. Nunca amplia a leitura dos documentos privados de usuário. Apenas o responsável resolve perfis de solicitantes de terceiros; membros podem ser apresentados na página autenticada. Se houver `desligamento_pendente`, a projeção retorna `motoclubeId: null`, embora a reserva interna permaneça.

As regras negam escritas diretas no módulo, inclusive ao responsável, que administra pela callable. Os campos de vínculo no usuário são protegidos contra alterações diretas e contra exclusão/recriação do perfil enquanto existir vínculo ou pedido pendente. A exclusão de conta verifica essas condições antes de apagar quaisquer dados; responsável por clube também precisa regularizar a administração antes de excluir a conta. Não foi acrescentado fluxo de transferência de responsabilidade.

Não há índice composto novo. As listas usam consultas simples por coleção/subcoleção e documentos individuais.

## Arquivos alterados ou novos

- `src/screens/FormularioManutencao.tsx`
- `src/screens/PerfilDaMoto.tsx`
- `src/screens/NovaViagem.tsx`
- `src/screens/ResumoRoteiro.tsx`
- `src/screens/DetalhesViagem.tsx`
- `src/screens/NovoEvento.tsx`
- `src/screens/DetalhesEvento.tsx`
- `src/screens/Motoclubes.tsx`
- `src/screens/Perfil.tsx`
- `src/services/motoclubes.ts`
- `src/services/account.ts`
- `functions/index.js`
- `functions/motoclubes.js`
- `firestore.rules`
- `storage.rules`
- `tests/edicao-p1.test.cjs`
- `tests/motoclubes.test.cjs`
- `tests/motoclube-perfis.test.cjs`
- `tests/firestore-motoclubes.test.cjs`
- Este documento.

## Validações

- `npx tsc --noEmit` / execução equivalente do TypeScript instalado: passou.
- `node --check functions/index.js` e `node --check functions/motoclubes.js`: passaram.
- Novos testes locais: **20 passaram** (7 de edição, 10 de relacionamento e concorrência simulada, 3 de privacidade da projeção).
- Teste com Firestore Emulator: **não executado**. Java, Firebase CLI e dependências do diretório `functions` não estão instalados neste ambiente. Esse teste é explicitamente ignorado sem `FIRESTORE_EMULATOR_HOST`.
- Suíte anterior: **39 passaram; 1 falhou**. A falha em `tests/versao-2.0.2.test.cjs:117` também ocorre no projeto original: espera `build.preview.android.buildType`, mas o `eas.json` existente só define `ios-simulator`. Não houve alteração de configuração de build fora do escopo.
- Não existe script de lint configurado.
- Não foi realizado teste visual em aparelho ou sessão real autenticada. Os testes de edição exercitam os handlers e a inicialização dos formulários com dependências simuladas.

Para validar regras e concorrência no banco, instalar as dependências existentes de `functions` e executar, com Firebase CLI e Java disponíveis:

```powershell
npm --prefix functions install
firebase emulators:exec --project demo-motohub-clubes --only firestore "node --test tests/firestore-motoclubes.test.cjs"
```

O teste usa um projeto `demo-` e aceita apenas emulador em localhost/127.0.0.1. Verifica alterações do proprietário, bloqueio de escrita de terceiros e de vínculo direto, privacidade, concorrência de aprovação e desligamento no banco.

## Pendências de implantação

1. Executar o teste com emulador e revisar as regras antes de liberar o módulo.
2. Publicar as duas novas callables e as regras de Firestore/Storage no projeto correto, antes de distribuir o aplicativo atualizado. Não foi feito deploy nesta tarefa.
3. Testar em duas contas reais (responsável e membro), incluindo seleção de brasão e edição/substituição de flyer. A infraestrutura publicada ainda precisa conter as novas regras e funções para o módulo operar.
4. A versão declarada continua `2.0.3`, como no código recebido, embora a pasta se chame `2.1.0`. Não foi alterada a numeração de release sem solicitação.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for server-managed membership, owner-only profile changes, and administrator-only access to private club records. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

Referências técnicas: [callables autenticadas](https://firebase.google.com/docs/functions/callable), [validação de regras com emulador](https://firebase.google.com/docs/firestore/security/test-rules-emulator).
