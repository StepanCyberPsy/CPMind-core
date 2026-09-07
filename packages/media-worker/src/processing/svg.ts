import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { MAX_SVG_SIZE_BYTES } from '../security/limits.js';
import { ProcessingError, type ProcessingResult } from '../types.js';

const ALLOWED_ELEMENTS = new Set([
    'svg',
    'g',
    'defs',
    'use',
    'symbol',
    'title',
    'desc',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'path',
    'text',
    'tspan',
    'textPath',
    'image',
    'style',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'pattern',
    'filter',
    'feGaussianBlur',
    'feBlend',
    'feColorMatrix',
    'feComposite',
    'feFlood',
    'feMerge',
    'feMergeNode',
    'feOffset',
    'feTurbulence',
    'feDisplacementMap',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feDistantLight',
    'feMorphology',
    'animate',
    'animateTransform',
    'animateMotion',
    'mpath',
    'a',
    'marker',
    'view',
]);

const DANGEROUS_URL_SCHEMES = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:'
];

const HREF_ATTRIBUTES = new Set([
    'href',
    'xlink:href',
    'src',
    'action',
    'formaction',
]);

const ATTR_PREFIX = '@_';
const TEXT_KEY = '#text';
const DECL_KEY = '?xml';
const CDATA_KEY = '#cdata';

function isDangerousUrl(value: string): boolean {
    const lower = value.trim().toLowerCase().replace(/\s+/g, '');
    return DANGEROUS_URL_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

function isBlockedAttribute(
    attrName: string,
    value: unknown,
): boolean {
    const name = attrName.toLowerCase();

    if (name.startsWith('on')) {
        return true;
    }

    if (HREF_ATTRIBUTES.has(name)) {
        const strValue = String(value ?? '').trim();
        if (isDangerousUrl(strValue)) {
            return true;
        }
    }

    return false;
}

function sanitizeValue(node: unknown, tagName: string | null): unknown {
    if (node === null || node === undefined) return node;
    if (typeof node !== 'object') return node;

    if (Array.isArray(node)) {
        return node
            .map((item) => sanitizeValue(item, tagName))
            .filter((item) => item !== null && item !== undefined);
    }

    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (key === DECL_KEY || key === TEXT_KEY || key === CDATA_KEY) {
            result[key] = value;
            continue;
        }

        if (key.startsWith(ATTR_PREFIX)) {
            const attrName = key.slice(ATTR_PREFIX.length);
            if (isBlockedAttribute(attrName, value)) {
                continue;
            }
            result[key] = value;
            continue;
        }

        if (!ALLOWED_ELEMENTS.has(key)) {
            continue;
        }

        result[key] = sanitizeValue(value, key);
    }

    return result;
}

function extractSvgDimension(
    svgNode: Record<string, unknown> | undefined,
    attrKey: string,
): number | null {
    if (!svgNode) return null;
    const raw = svgNode[attrKey];
    if (raw === undefined || raw === null) return null;
    const value = parseInt(String(raw), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

export async function processSvg(
    localPath: string,
    tempDir: string,
    signal: AbortSignal,
): Promise<ProcessingResult> {
    signal.throwIfAborted();

    const rawContent = await readFile(localPath, 'utf8');

    if (rawContent.length > MAX_SVG_SIZE_BYTES) {
        throw new ProcessingError(
            'PROCESSING_SIZE_EXCEEDED',
            `SVG content exceeds ${MAX_SVG_SIZE_BYTES} bytes`,
        );
    }

    // Reject DOCTYPE и ENTITY до парсинга — XXE происходит на уровне XML parser
    if (/<!DOCTYPE/i.test(rawContent)) {
        throw new ProcessingError('SECURITY_SVG_DOCTYPE', 'SVG contains DOCTYPE declaration');
    }

    if (/<!ENTITY/i.test(rawContent)) {
        throw new ProcessingError('SECURITY_SVG_ENTITY', 'SVG contains ENTITY declaration');
    }

    signal.throwIfAborted();

    const parser = new XMLParser({
        attributeNamePrefix: ATTR_PREFIX,
        ignoreAttributes: false,
        allowBooleanAttributes: true,
        processEntities: false,
        parseTagValue: false,
        trimValues: false,
        parseAttributeValue: false,
        numberParseOptions: { leadingZeros: false, hex: false, skipLike: /.*/ },
    });

    let parsed: Record<string, unknown>;
    try {
        parsed = parser.parse(rawContent) as Record<string, unknown>;
    } catch (err) {
        throw new ProcessingError(
            'SVG_XML_PARSE_FAILED',
            `SVG XML parse error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (!parsed['svg'] && !parsed[DECL_KEY]) {
        throw new ProcessingError('SVG_XML_PARSE_FAILED', 'Parsed SVG has no root svg element');
    }

    const sanitized = sanitizeValue(parsed, null) as Record<string, unknown>;

    if (!sanitized['svg']) {
        throw new ProcessingError(
            'SECURITY_SVG_BLOCKED',
            'SVG root element was removed by sanitization',
        );
    }

    const builder = new XMLBuilder({
        attributeNamePrefix: ATTR_PREFIX,
        ignoreAttributes: false,
        format: false,
        suppressBooleanAttributes: false,
        cdataPropName: CDATA_KEY,
    });

    const outputXml: string = builder.build(sanitized);
    const outputPath = join(tempDir, 'sanitized.svg');

    await writeFile(outputPath, outputXml, 'utf8');

    signal.throwIfAborted();

    const svgNode = sanitized['svg'] as Record<string, unknown> | undefined;
    const svgWidth = extractSvgDimension(svgNode, '@_width');
    const svgHeight = extractSvgDimension(svgNode, '@_height');

    return {
        sha256: '',
        files: [{
            localPath: outputPath,
            assetClass: 'svg',
            mimeType: 'image/svg+xml',
            extension: 'svg',
            role: 'source',
            priority: 0,
            ...(svgWidth !== null && { width: svgWidth }),
            ...(svgHeight !== null && { height: svgHeight }),
        }],
    };
}