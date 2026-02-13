function safeParseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function detectGetEndpoint(swaggerLike) {
  const paths = swaggerLike?.paths;
  if (!paths || typeof paths !== 'object') return '/api/reservation/cancel-context';
  const pathEntries = Object.entries(paths);
  for (const [route, methods] of pathEntries) {
    if (methods && typeof methods === 'object' && methods.get) {
      return route;
    }
  }
  return '/api/reservation/cancel-context';
}

function collectPropertyNames(schema) {
  if (!schema || typeof schema !== 'object') return [];
  const props = schema.properties && typeof schema.properties === 'object'
    ? Object.keys(schema.properties)
    : [];
  return props;
}

function deriveTableRowsFromSample(sample) {
  function isScalar(value) {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  }

  function isRowLikeObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const reservedKeys = ['openapi', 'swagger', 'paths', 'components'];
    if (reservedKeys.some((key) => Object.prototype.hasOwnProperty.call(obj, key))) return false;
    const values = Object.values(obj);
    if (values.length === 0) return false;
    return values.some((value) => isScalar(value));
  }

  if (Array.isArray(sample)) {
    if (sample.length === 0) return [];
    return sample.slice(0, 5).map((row, index) => {
      if (row && typeof row === 'object') return row;
      return { id: `ROW-${index + 1}`, value: String(row) };
    });
  }
  if (sample && typeof sample === 'object') {
    if (Array.isArray(sample.rows)) return deriveTableRowsFromSample(sample.rows);
    if (Array.isArray(sample.items)) return deriveTableRowsFromSample(sample.items);
    if (Array.isArray(sample.data)) return deriveTableRowsFromSample(sample.data);
    if (isRowLikeObject(sample)) {
      return [sample];
    }
    return [];
  }
  return [];
}

function uniqueStrings(values, fallback = []) {
  const set = new Set((values || []).filter((v) => typeof v === 'string' && v.trim().length > 0));
  if (set.size === 0) {
    for (const item of fallback) set.add(item);
  }
  return Array.from(set);
}

export function extractDataContext(rawSchema) {
  const parsed = safeParseJson(rawSchema);
  const defaultContext = {
    sourceType: 'none',
    endpoint: '/api/reservation/cancel-context',
    fields: ['reservationId', 'partnerName', 'status', 'cancelReason'],
    tableRows: [
      { reservationId: 'R-240211-001', partnerName: '여기어때 파트너', status: 'pending', cancelReason: '고객요청' }
    ],
    options: {
      cancelReason: ['고객요청', '중복예약', '기타'],
      status: ['pending', 'confirmed', 'canceled']
    }
  };

  if (!parsed) return defaultContext;

  const fromRows = deriveTableRowsFromSample(parsed);
  const rootCancelOptions = Array.isArray(parsed?.cancelReason) ? parsed.cancelReason : [];
  const rootStatusOptions = Array.isArray(parsed?.status) ? parsed.status : [];
  if (fromRows.length > 0) {
    const first = fromRows[0] || {};
    const cancelOptions = uniqueStrings(
      fromRows.map((row) => row.cancelReason).filter(Boolean),
      defaultContext.options.cancelReason
    );
    const statusOptions = uniqueStrings(
      fromRows.map((row) => row.status).filter(Boolean),
      defaultContext.options.status
    );
    return {
      sourceType: 'sample_json',
      endpoint: '/api/reservation/cancel-context',
      fields: Object.keys(first),
      tableRows: fromRows,
      options: {
        cancelReason: uniqueStrings([...rootCancelOptions, ...cancelOptions], defaultContext.options.cancelReason),
        status: uniqueStrings([...rootStatusOptions, ...statusOptions], defaultContext.options.status)
      }
    };
  }

  const endpoint = detectGetEndpoint(parsed);
  const responseSchema =
    parsed?.components?.schemas?.Reservation ||
    parsed?.components?.schemas?.ReservationItem ||
    parsed?.components?.schemas?.CancelContext ||
    null;
  const schemaFields = collectPropertyNames(responseSchema);
  const enumCancel =
    responseSchema?.properties?.cancelReason?.enum ||
    responseSchema?.properties?.reason?.enum ||
    [];
  const enumStatus = responseSchema?.properties?.status?.enum || [];

  return {
    sourceType: parsed?.openapi || parsed?.swagger ? 'swagger' : 'json_schema',
    endpoint,
    fields: schemaFields.length > 0 ? schemaFields : defaultContext.fields,
    tableRows: defaultContext.tableRows,
    options: {
      cancelReason: uniqueStrings([...rootCancelOptions, ...enumCancel], defaultContext.options.cancelReason),
      status: uniqueStrings([...rootStatusOptions, ...enumStatus], defaultContext.options.status)
    }
  };
}
