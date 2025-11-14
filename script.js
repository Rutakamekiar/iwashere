// script.js

// Basic type detection
function getType(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
}

// Merge schemas and propagate coordinate flag
function mergePropertySchemas(schemas) {
    const typeSet = new Set();
    const objectSchemas = [];
    let hasCoordinate = false;
    schemas.forEach(sch => {
        if (Array.isArray(sch.type)) sch.type.forEach(t => typeSet.add(t)); else typeSet.add(sch.type);
        if (sch.type === 'object' || (Array.isArray(sch.type) && sch.type.includes('object'))) objectSchemas.push(sch);
        if (sch.coordinate) hasCoordinate = true;
    });
    const types = Array.from(typeSet);
    const result = { type: types.length === 1 ? types[0] : types };
    if (objectSchemas.length) {
        const allProps = {};
        objectSchemas.forEach(objSch => {
            for (const key in (objSch.properties || {})) {
                allProps[key] = allProps[key] || [];
                allProps[key].push(objSch.properties[key]);
            }
        });
        result.properties = {};
        Object.keys(allProps).forEach(key => {
            result.properties[key] = mergePropertySchemas(allProps[key]);
        });
    }
    if (hasCoordinate) result.coordinate = true;
    return result;
}

// Heuristics for coordinate strings
function isCoordinateString(val) {
    if (typeof val !== 'string') return false;
    const regex = /^geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/i;
    return regex.test(val.trim());
}
function parseCoordinateString(val) {
    const match = val.trim().match(/^geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/i);
    return match ? [parseFloat(match[1]), parseFloat(match[2])] : null;
}

// Extract schema and flag coordinates
function extractSchema(node) {
    const t = getType(node);
    let schema;
    if (t === 'object') {
        const props = {};
        Object.keys(node).forEach(k => {
            props[k] = extractSchema(node[k]);
        });
        schema = { type: 'object', properties: props };
    } else if (t === 'array') {
        const itemSch = node.map(el => extractSchema(el));
        schema = { type: 'array', items: mergePropertySchemas(itemSch) };
    } else {
        schema = { type: t };
    }
    if (schema.type === 'string' && isCoordinateString(node)) schema.coordinate = true;
    return schema;
}

// Recursively find and return unique coordinate pairs from data
function getCoordinates(data) {
    const arr = Array.isArray(data) ? data : [data];
    const rawCoords = [];
    function findCoords(node) {
        if (typeof node === 'string' && isCoordinateString(node)) {
            const pair = parseCoordinateString(node);
            if (pair) rawCoords.push({ lat: pair[0], lng: pair[1] });
        } else if (Array.isArray(node)) {
            node.forEach(el => findCoords(el));
        } else if (node !== null && typeof node === 'object') {
            Object.values(node).forEach(val => findCoords(val));
        }
    }
    arr.forEach(item => findCoords(item));
    // Deduplicate
    const seen = new Set();
    return rawCoords.filter(c => {
        const key = c.lat + ',' + c.lng;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Canonicalize for consistent keys
function canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(canonicalize);
    const out = {};
    Object.keys(obj).sort().forEach(k => { out[k] = canonicalize(obj[k]); });
    return out;
}

// Extract unique schema variants and examples
function getVariants(data) {
    const arr = Array.isArray(data) ? data : [data];
    const seen = new Map();
    arr.forEach(item => {
        const sch = extractSchema(item);
        const canon = canonicalize(sch);
        const key = JSON.stringify(canon);
        if (!seen.has(key)) seen.set(key, { schema: canon, example: item });
    });
    return Array.from(seen.values());
}

// Process file on selection and render results
function processFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        let data;
        try { data = JSON.parse(e.target.result); }
        catch (err) { return alert('JSON parse error: ' + err.message); }

        const variants = getVariants(data);
        const coordinates = getCoordinates(data);

        document.getElementById('variantsOutput').textContent = JSON.stringify(variants, null, 2);
        document.getElementById('coordsOutput').textContent = JSON.stringify(coordinates, null, 2);
    };
    reader.readAsText(file);
}