import type { DeliveryMode, TagConstantsValues } from '@cpmind/shared';
import { getCdnBaseUrl, getDeliveryBaseUrl, getOmidRuntimeVersion } from '../../lib/env.js';
import { escapeXml } from './xml.js';

/**
 * Идентификатор вендора верификации. Формат [domain]-[useCase] по VAST 4.3 §3.17.
 * Значение попадает в sessionStart как vendorKey и используется скриптом при вызове
 * registerSessionObserver: параметры верификации доставляются только наблюдателю
 * с совпавшим ключом.
 */
export const CPMIND_OMID_VENDOR = 'cpmind.tech-omid';

/**
 * Данные, которые скрипту верификации неоткуда взять самостоятельно. Доставляются
 * через <VerificationParameters> — штатный канал OMID. Складывать их в URL скрипта
 * нельзя: уникальный адрес на каждый показ лишает бандл кэширования на CDN.
 */
export interface OmidVerificationParams {
    adSessionId: string;
    tagUuid: string;
    tagConstantsVersion: string;
    campaignKey: string;
    creativeKey: string;
    creativeType: string;
    placementUuid: string;
    creativeVersionUuid: string;
    deliveryKind: 'inline' | 'wrapper';
    collectEndpoint: string;

    // Режим доставки и значения констант тега нужны ветке с коллекторами
    // страницы: SDK строит по ним идентификатор сессии и конфигурацию сигналов.
    // Источник тот же, что у embed-скрипта, — контекст выданной сессии
    deliveryMode: DeliveryMode;
    tagConstants: TagConstantsValues;
}

function buildOmidScriptUrl(): string {
    return `${getCdnBaseUrl()}/runtime/cpmind-omid_v${getOmidRuntimeVersion()}.min.js`;
}

// CDATA завершается первой же последовательностью ]]> — разрыв её на две секции
// сохраняет исходный текст и не ломает разбор
function wrapCdata(value: string): string {
    return `<![CDATA[${value.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

/**
 * Блок <AdVerifications> для InLine или Wrapper.
 *
 * browserOptional="false": скрипт использует DOM и браузерные API, в окружении без них
 * (например JavaScriptCore) исполнять его нельзя. По VAST 4.3 §3.17.1 такой плеер
 * обязан отправить verificationNotExecuted с кодом 2 — для нас это достоверный сигнал
 * непригодной среды, а не потеря показа.
 *
 * Порядок вложенных элементов соответствует VAST 4.3 §3.17:
 * JavaScriptResource, ExecutableResource, TrackingEvents, VerificationParameters.
 */
export function buildAdVerificationsBlock(
    params: OmidVerificationParams,
    indent = '      ',
): string[] {
    const trackBase = `${getDeliveryBaseUrl()}/t/vast`;
    const sid = params.adSessionId;
    const i = indent;

    const payload = JSON.stringify({
        sid,
        tag_uuid: params.tagUuid,
        tag_constants_version: params.tagConstantsVersion,
        campaign_id: params.campaignKey,
        creative_id: params.creativeKey,
        creative_type: params.creativeType,
        placement_uuid: params.placementUuid,
        creative_version_uuid: params.creativeVersionUuid,
        delivery_kind: params.deliveryKind,
        collect_endpoint: params.collectEndpoint,
        delivery_mode: params.deliveryMode,
        tag_constants: params.tagConstants,
    });

    const notExecutedUrl =
        `${trackBase}/verificationNotExecuted?sid=${sid}&reason=[REASON]&cb=[CACHEBUSTING]`;

    return [
        `${i}<AdVerifications>`,
        `${i}  <Verification vendor="${escapeXml(CPMIND_OMID_VENDOR)}">`,
        `${i}    <JavaScriptResource apiFramework="omid" browserOptional="false">`
            + wrapCdata(buildOmidScriptUrl())
            + '</JavaScriptResource>',
        `${i}    <TrackingEvents>`,
        `${i}      <Tracking event="verificationNotExecuted">`
            + wrapCdata(notExecutedUrl)
            + '</Tracking>',
        `${i}    </TrackingEvents>`,
        `${i}    <VerificationParameters>` + wrapCdata(payload) + '</VerificationParameters>',
        `${i}  </Verification>`,
        `${i}</AdVerifications>`,
    ];
}

/**
 * Тот же блок для потребителей ниже VAST 4.1, где элемент <AdVerifications> ещё
 * не был частью InLine. Передаётся расширением с тем же содержимым — приём,
 * описанный в руководстве OMID для веба.
 *
 * Плеер, понимающий 4.1 и выше, прочитает оба и исполнит ресурс один раз:
 * ключ вендора совпадает, а дедупликация вендоров предусмотрена спецификацией.
 */
export function buildAdVerificationsExtensionBlock(
    params: OmidVerificationParams,
    indent = '      ',
): string[] {
    const i = indent;
    const inner = buildAdVerificationsBlock(params, `${i}    `);

    return [
        `${i}<Extensions>`,
        `${i}  <Extension type="AdVerifications">`,
        ...inner,
        `${i}  </Extension>`,
        `${i}</Extensions>`,
    ];
}
