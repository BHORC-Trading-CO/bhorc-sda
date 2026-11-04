import ProxySetupInterface from "./ProxySetupInterface";

export default interface ProxySelection {
    proxyMode: "noProxy" | "savedProxy" | "newProxy";
    proxyId: string | null;
    newProxy: ProxySetupInterface | null;
}
