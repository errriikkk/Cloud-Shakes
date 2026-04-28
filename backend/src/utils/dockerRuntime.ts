type DockerModule = {
    default?: new (opts?: any) => any;
};

export async function getDockerClientSafe() {
    try {
        const mod = (await import('dockerode')) as DockerModule;
        const DockerCtor = mod.default;
        if (!DockerCtor) {
            return { available: false as const, client: null };
        }
        return { available: true as const, client: new DockerCtor() };
    } catch {
        return { available: false as const, client: null };
    }
}
