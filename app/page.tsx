import GuandanApp from './components/GuandanApp';

export default function Home(){return <GuandanApp supportUrl={process.env.SUPPORT_URL||''}/>}
