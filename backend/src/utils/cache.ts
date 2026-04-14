import NodeCache from 'node-cache';

export const telemetryCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
