import type { Messages } from './index';

/** Loaded with the public site; the rest of the back-office copy is in ./admin (lazy). */
export const core = {
  'Chargement…': { en: 'Loading…', ar: 'جارٍ التحميل…' },
  'Annuler': { en: 'Cancel', ar: 'إلغاء' },
  'Confirmer': { en: 'Confirm', ar: 'تأكيد' },
  'Fermer': { en: 'Close', ar: 'إغلاق' },
  'Réessayer': { en: 'Try again', ar: 'إعادة المحاولة' },
  'Rechercher…': { en: 'Search…', ar: 'بحث…' },
  'Erreur inattendue.': { en: 'Unexpected error.', ar: 'خطأ غير متوقع.' },
  'Impossible de joindre le serveur. Vérifiez votre connexion.': { en: 'Cannot reach the server. Check your connection.', ar: 'تعذّر الاتصال بالخادم. تحقق من اتصالك.' },
  'Le serveur ne répond pas correctement. Réessayez dans un instant.': { en: 'The server is not responding properly. Try again in a moment.', ar: 'الخادم لا يستجيب بشكل صحيح. أعد المحاولة بعد قليل.' },
  'Requête refusée ({status}).': { en: 'Request refused ({status}).', ar: 'تم رفض الطلب ({status}).' },
  'Cette page n’existe pas.': { en: 'This page does not exist.', ar: 'هذه الصفحة غير موجودة.' },
  'Retour à l’accueil': { en: 'Back to home', ar: 'العودة إلى الرئيسية' },
  'Ouverture de la session…': { en: 'Opening your session…', ar: 'جارٍ فتح الجلسة…' },
} satisfies Messages;
