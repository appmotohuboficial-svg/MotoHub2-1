const {initializeApp} = require('firebase-admin/app');
const {getStorage} = require('firebase-admin/storage');
const {onDocumentDeleted} = require('firebase-functions/v2/firestore');

initializeApp();

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {createClubService} = require('./motoclubes');
const clubService = createClubService(getFirestore(), () => FieldValue.serverTimestamp(),
  (code, message) => { throw new HttpsError(code, message); });
exports.motoclubeAcao = onCall({region: 'southamerica-east1'}, request =>
  clubService(request.auth?.uid, request.data));

// Resolve only display fields from usuarios/{uid}; never expose private documents.
exports.motoclubePerfis = onCall({region: 'southamerica-east1'}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const id = request.data?.motoclubeId;
  if (typeof id !== 'string' || !id || id.includes('/')) throw new HttpsError('invalid-argument', 'Clube inválido.');
  const db = getFirestore();
  const club = (await db.doc(`motoclubes/${id}`).get()).data();
  if (!club) throw new HttpsError('not-found', 'Clube não encontrado.');
  const admin = club.responsavelUserId === request.auth.uid;
  const uids = request.data.userIds;
  if (!Array.isArray(uids) || uids.length > 50 || uids.some(uid => typeof uid !== 'string' || !uid || uid.includes('/'))) throw new HttpsError('invalid-argument', 'Usuários inválidos.');
  const profiles = await Promise.all(uids.map(async uid => {
    if (uid !== request.auth.uid && !(club.membrosIds || []).includes(uid)) {
      if (!admin) throw new HttpsError('permission-denied', 'Sem acesso.');
      const application = await db.doc(`motoclubes/${id}/solicitacoes/${uid}`).get();
      if (!application.exists) throw new HttpsError('permission-denied', 'Sem acesso.');
    }
    const user = (await db.doc(`usuarios/${uid}`).get()).data() || {};
    return {userId: uid, nome: user.nomeCompleto || user.nome || 'Motociclista', fotoUrl: user.fotoUrl || '', cidade: user.cidade || '',
      motoclubeId: user.statusMotoclube === 'membro' ? user.motoclubeId || null : null};
  }));
  return profiles;
});

exports.cleanupEventBanner = onDocumentDeleted(
  {
    document: 'eventos/{eventoId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const flyerPath = event.data?.data()?.flyerPath;
    if (!flyerPath) return;

    await getStorage().bucket().file(flyerPath).delete({ignoreNotFound: true});
  },
);
