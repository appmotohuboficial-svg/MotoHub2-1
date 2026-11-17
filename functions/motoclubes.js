// All relationship mutations go through this transaction boundary; clients cannot
// write membership fields, requests, club lists or administrative history.
function createClubService(db, stamp, fail) {
  const text = (v, max = 1000) => {
    if (typeof v !== 'string' || v.length > max) fail('invalid-argument', 'Campo inválido.');
    return v.trim();
  };
  const id = v => {
    if (typeof v !== 'string' || !v || v.includes('/') || v.length > 128) fail('invalid-argument', 'Identificador inválido.');
    return v;
  };
  return async (uid, data) => {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    const {acao} = data || {};
    if (acao === 'criar') {
      const input = data.clube || {};
      const fields = ['nome','sigla','logoUrl','descricao','anoFundacao','cidade','uf','instagram','facebook','site','contato','endereco','observacoes'];
      const clube = Object.fromEntries(fields.map(k => [k, text(input[k] ?? '', k === 'logoUrl' ? 1500 : 1000)]));
      if (!clube.nome || !clube.cidade || !clube.logoUrl.startsWith('https://') || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(clube.uf)) fail('invalid-argument', 'Preencha nome, brasão HTTPS, cidade e UF válidos.');
      const cnpj = text(input.cnpj ?? '', 30).replace(/\D/g, '');
      if (cnpj && cnpj.length !== 14) fail('invalid-argument', 'Informe 14 dígitos no CNPJ.');
      const ref = db.collection('motoclubes').doc();
      await db.runTransaction(async tx => {
        const user = await tx.get(db.doc(`usuarios/${uid}`));
        if (!user.exists) fail('failed-precondition', 'Complete seu perfil.');
        const exibirCnpjPublicamente = input.exibirCnpjPublicamente === true;
        tx.set(ref, {...clube, id: ref.id, criadorUserId: uid, responsavelUserId: uid,
          createdAt: stamp(), updatedAt: stamp(), membrosIds: [], amigosIds: [],
          exibirCnpjPublicamente, ...(exibirCnpjPublicamente && cnpj ? {cnpjPublico: cnpj} : {})});
        tx.set(ref.collection('privado').doc('cadastro'), {cnpj});
      });
      return {id: ref.id};
    }
    const clubId = id(data?.motoclubeId);
    const clubRef = db.doc(`motoclubes/${clubId}`);
    const userId = ['aprovar','recusar','remover','concluir'].includes(acao) ? id(data.userId) : uid;
    const userRef = db.doc(`usuarios/${userId}`);
    const requestRef = clubRef.collection('solicitacoes').doc(userId);
    return db.runTransaction(async tx => {
      const [clubSnap, userSnap, requestSnap] = await Promise.all([tx.get(clubRef), tx.get(userRef), tx.get(requestRef)]);
      if (!clubSnap.exists || !userSnap.exists) fail('not-found', 'Clube ou usuário não encontrado.');
      const club = clubSnap.data(), user = userSnap.data(), request = requestSnap.data();
      const admin = club.responsavelUserId === uid;
      const members = club.membrosIds || [], friends = club.amigosIds || [];
      const updateClub = changes => tx.update(clubRef, {...changes, updatedAt: stamp()});
      if (acao === 'amigo' || acao === 'deixar_amigo') {
        updateClub({amigosIds: acao === 'amigo' ? [...new Set([...friends, uid])] : friends.filter(x => x !== uid)});
      } else if (acao === 'solicitar') {
        if (user.motoclubeId || user.statusMotoclube === 'pendente') fail('failed-precondition', 'Você já tem vínculo ou solicitação pendente.');
        if (request?.status === 'pendente') fail('already-exists', 'Solicitação já enviada.');
        // Pending applications reserve no official membership ID.
        tx.set(requestRef, {id: userId, userId, motoclubeId: clubId, status: 'pendente', solicitadoEm: stamp(), respondidoEm: null, respondidoPor: null});
        tx.update(userRef, {motoclubeId: null, statusMotoclube: 'pendente', solicitacaoMotoclubeId: clubId});
      } else if (['cancelar','aprovar','recusar'].includes(acao)) {
        if (acao !== 'cancelar' && !admin) fail('permission-denied', 'Somente o responsável pode responder.');
        if (!request || request.status !== 'pendente' || user.solicitacaoMotoclubeId !== clubId) fail('failed-precondition', 'Solicitação não está pendente.');
        if (acao === 'aprovar' && (user.motoclubeId || members.includes(userId))) fail('failed-precondition', 'Usuário já pertence a um Motoclube.');
        tx.update(requestRef, {status: acao === 'aprovar' ? 'aprovado' : acao === 'recusar' ? 'recusado' : 'cancelado', respondidoEm: stamp(), respondidoPor: uid});
        if (acao === 'aprovar') {
          updateClub({membrosIds: [...members, userId]});
          tx.update(userRef, {motoclubeId: clubId, statusMotoclube: 'membro', solicitacaoMotoclubeId: null});
          tx.set(clubRef.collection('membros').doc(userId), {userId, entrouEm: stamp(), situacao: 'membro'});
        } else tx.update(userRef, {statusMotoclube: user.motoclubeId ? user.statusMotoclube : 'nenhum', solicitacaoMotoclubeId: null});
      } else if (acao === 'desligamento') {
        if (user.motoclubeId !== clubId || user.statusMotoclube !== 'membro' || !members.includes(uid)) fail('failed-precondition', 'Vínculo não encontrado.');
        tx.update(userRef, {statusMotoclube: 'desligamento_pendente'});
        tx.update(clubRef.collection('membros').doc(uid), {situacao: 'desligamento_pendente'});
      } else if (acao === 'remover' || acao === 'concluir') {
        if (!admin) fail('permission-denied', 'Somente o responsável pode remover membros.');
        if (user.motoclubeId !== clubId || !members.includes(userId)) fail('failed-precondition', 'Vínculo não encontrado.');
        if (acao === 'concluir' && user.statusMotoclube !== 'desligamento_pendente') fail('failed-precondition', 'Não há desligamento pendente.');
        if (!['com_honra','sem_honra','administrativo'].includes(data.tipoDesligamento)) fail('invalid-argument', 'Classificação inválida.');
        const memberRef = clubRef.collection('membros').doc(userId);
        const member = await tx.get(memberRef);
        tx.set(clubRef.collection('historico').doc(), {userId, entrouEm: member.data()?.entrouEm || null,
          saiuEm: stamp(), tipoDesligamento: data.tipoDesligamento, motivoDesligamento: text(data.motivoDesligamento ?? ''), removidoPor: uid});
        updateClub({membrosIds: members.filter(x => x !== userId)});
        tx.update(userRef, {motoclubeId: null, motoclubeNome: null, statusMotoclube: 'nenhum', solicitacaoMotoclubeId: null});
        tx.delete(memberRef);
      } else fail('invalid-argument', 'Ação inválida.');
      return {ok: true};
    });
  };
}

module.exports = {createClubService};
