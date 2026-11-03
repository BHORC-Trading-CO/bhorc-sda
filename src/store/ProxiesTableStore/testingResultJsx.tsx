import TableProxyInterface from "../../../electron/interfaces/Proxy/TableProxyInterface";
import { Trans } from "react-i18next";

export default (props: { isSuccess: boolean, proxy: TableProxyInterface }) => {
    const { isSuccess, proxy } = props;
    const values = { number: proxy.number, host: proxy.host, port: proxy.port };
    return isSuccess ? <Trans i18nKey="proxies.test.workingRich" values={values} components={{ b: <b style={{color: "var(--sda-success)"}} /> }} />
     : <Trans i18nKey="proxies.test.notWorkingRich" values={values} components={{ b: <b style={{color: "var(--sda-danger)"}} /> }} />;
}