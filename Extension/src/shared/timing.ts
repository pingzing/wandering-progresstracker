export function debounce<T extends (...args: any[]) => void>(wait: number, callback: T) {
    let timeout: ReturnType<typeof setTimeout> | null;
    return function <U>(this: U, ...args: Parameters<typeof callback>) {
        const context = this;
        const later = () => {
            timeout = null;
            callback.apply(context, args);
        };

        if (typeof timeout === "number") {
            clearTimeout(timeout);
        }

        timeout = setTimeout(later, wait);
    }
}