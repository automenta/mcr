import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { prolog } from 'codemirror-lang-prolog';

const PrologCodeViewer = ({ code }) => {
	const editorRef = useRef(null);
	const viewRef = useRef(null);

	useEffect(() => {
		if (editorRef.current && !viewRef.current) {
			const state = EditorState.create({
				doc: code || '',
				extensions: [
					basicSetup,
					EditorView.lineWrapping,
					oneDark,
					prolog(),
					EditorState.readOnly.of(true),
					EditorView.theme({
						'&': {
							height: '100%',
							fontSize: '0.9em',
							backgroundColor: 'transparent',
						},
						'.cm-scroller': { overflow: 'auto' },
						'.cm-gutters': { backgroundColor: 'var(--background-color)' },
					}),
				],
			});
			const view = new EditorView({ state, parent: editorRef.current });
			viewRef.current = view;
		} else if (viewRef.current) {
			viewRef.current.dispatch({
				changes: {
					from: 0,
					to: viewRef.current.state.doc.length,
					insert: code || '',
				},
			});
		}

		return () => {
			if (viewRef.current) {
				viewRef.current.destroy();
				viewRef.current = null;
			}
		};
	}, [code]);

	return <div ref={editorRef} style={{ height: '100%' }}></div>;
};

export default PrologCodeViewer;
