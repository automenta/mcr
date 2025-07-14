import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { ws } from '../api';

export default function TauReplPane({ sessionId }) {
  const editorRef = useRef();
  useEffect(() => {
    const ed = monaco.editor.create(editorRef.current, { language: 'prolog' });
    ed.onKeyDown(e => {
      if (e.keyCode === 13 && e.ctrlKey) {
        const goal = ed.getValue();
        ws.invoke('symbolic.export', { sessionId, goal })
          .then(r => ed.setValue(ed.getValue() + '\n% ' + JSON.stringify(r.data)));
      }
    });
  }, [sessionId]);
  return <div ref={editorRef} style={{ height: 300 }} />;
}
