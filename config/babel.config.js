module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				targets: {
					node: '18', // Assuming Node 18+ based on old config and common practice
				},
			},
		],
		'@babel/preset-react',
	],
};
