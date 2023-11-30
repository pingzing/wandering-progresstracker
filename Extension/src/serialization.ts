export function mapToString<K, V>(map: Map<K, V>): string {
    return JSON.stringify(Array.from(map.entries()));
}

export function stringToMap<K, V>(jsonText: string): Map<K, V> {
    return new Map(JSON.parse(jsonText));
}