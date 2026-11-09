import '@fontsource-variable/inter';
import { render } from 'preact';
import '../styles/popup.css';
import { App } from './App';

render(<App />, document.getElementById('app') as HTMLElement);
