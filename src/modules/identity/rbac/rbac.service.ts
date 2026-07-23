import { type Action, type Actor, type ResourceRef, type Scope } from './permission.types';
import { POLICY } from './policy.registry';

export { type ResourceRef } from './permission.types';

/**
 * RBAC yadrosi — sof klass, dekoratorsiz, framework bog'liqliksiz.
 * NestJS guard'lari keyinroq shu servisni o'raydi.
 *
 * Qaror qoidalari (docs/01-product-spec.md §4.2):
 *
 *  1. Muddati o'tgan biriktirma hech narsa bermaydi — ARBITER roli
 *     turnir tugagach `validUntil` bilan tugaydi (§4.3 bandi 5).
 *
 *  2. Grant `scoped` bo'lsa (matritsadagi yulduzcha) — HAR QANDAY amal
 *     uchun assignment scope resursni qamrashi shart.
 *
 *  3. Grant yulduqchasiz bo'lsa ham YOZUV amallari (create/update/delete)
 *     baribir assignment scope bilan chegaralanadi. Sabab: matritsada
 *     FEDERATION_ADMIN ning `Tournament` katagi `CRUD` (yulduqchasiz),
 *     lekin uning qamrovi "bitta Federation" — boshqa federatsiyaning
 *     turnirini o'zgartira olmasligi kerak. Yulduqchasiz katak faqat
 *     OCHIQ O'QISHNI bildiradi (kalendar, reyting ro'yxati kabi ochiq
 *     ma'lumot); yozuv esa hech qachon o'z qamrovidan chiqmaydi.
 *     SUPER_ADMIN uchun bu farq yo'q — uning scope'i global.
 *
 * Yakuniy qoida: `scoped` faqat O'QISH semantikasini o'zgartiradi;
 * yozuv har doim scope-bound.
 */
export class RbacService {
  /**
   * Aktor `action` ni `resource` ustida bajara oladimi.
   *
   * @param now Muddat tekshiruvi uchun "hozir" — testlarda determinizm
   *            uchun tashqaridan beriladi.
   */
  can(actor: Actor, action: Action, resource: ResourceRef, now: Date = new Date()): boolean {
    return actor.assignments.some((a) => {
      if (a.validUntil && a.validUntil < now) {
        return false; // ARBITER — turnir bilan birga tugaydi
      }
      const grant = POLICY[a.role].find((g) => g.resource === resource.type);
      if (!grant?.actions.includes(action)) {
        return false;
      }
      // Yulduqchasiz o'qish — ochiq ma'lumot, scope talab qilinmaydi.
      if (action === 'read' && grant.scoped !== true) {
        return true;
      }
      // Yulduqchali katak yoki har qanday yozuv — scope qamrashi shart.
      return this.scopeCovers(a.scope, actor.userId, resource);
    });
  }

  /**
   * Aktor yoza oladigan ustunlar.
   *
   * 'all' = cheklovsiz; [] = update huquqi umuman yo'q.
   * Bir nechta mos grant bo'lsa: birortasi cheklovsiz bo'lsa — 'all',
   * aks holda `fields` lar birlashmasi.
   */
  writableFields(
    actor: Actor,
    resource: ResourceRef,
    now: Date = new Date(),
  ): 'all' | readonly string[] {
    const fields = new Set<string>();
    let hasRestrictedGrant = false;

    for (const a of actor.assignments) {
      if (a.validUntil && a.validUntil < now) {
        continue;
      }
      const grant = POLICY[a.role].find((g) => g.resource === resource.type);
      if (!grant?.actions.includes('update')) {
        continue;
      }
      // update = yozuv → scope har doim tekshiriladi (yuqoridagi qoida 3).
      if (!this.scopeCovers(a.scope, actor.userId, resource)) {
        continue;
      }
      if (!grant.fields || grant.fields.length === 0) {
        return 'all';
      }
      hasRestrictedGrant = true;
      for (const field of grant.fields) {
        fields.add(field);
      }
    }

    return hasRestrictedGrant ? [...fields] : [];
  }

  /**
   * Assignment scope maqsad resursni qamraydimi — §4.2 dagi jadval:
   * global hammani; own — resurs egasi aktorning o'zi; qolganlari —
   * mos ierarxiya identifikatori tengligi. `ResourceRef` dagi maydon
   * yo'q bo'lsa (undefined) — qamramaydi, ruxsat berilmaydi (IDOR
   * himoyasi: noaniqlik = rad).
   */
  private scopeCovers(scope: Scope, actorUserId: string, r: ResourceRef): boolean {
    switch (scope.kind) {
      case 'global':
        return true;
      case 'own':
        return r.ownerUserId === actorUserId;
      case 'federation':
        return r.federationId === scope.federationId;
      case 'region':
        return r.regionId === scope.regionId;
      case 'club':
        return r.clubId === scope.clubId;
      case 'tournament':
        return r.tournamentId === scope.tournamentId;
      case 'school':
        return r.schoolId === scope.schoolId;
    }
  }
}
