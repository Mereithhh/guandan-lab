export type DeploymentCheck={id:string;label:string;status:'pass'|'warn'|'fail';message:string};
export type DeploymentReport={ready:boolean;checks:DeploymentCheck[];summary:{pass:number;warn:number;fail:number}};
export function assessDeployment(env:Record<string,string|undefined>,options?:{locale?:'zh'|'en'}):DeploymentReport;
export function formatDeploymentReport(report:DeploymentReport,locale?:'zh'|'en'):string;
