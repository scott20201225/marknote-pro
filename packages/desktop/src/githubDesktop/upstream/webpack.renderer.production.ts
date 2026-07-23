import * as path from 'path'
import * as webpack from 'webpack'
import * as fs from 'fs-extra'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { getReplacements } from './app-info'

const copyGitHubDesktopStaticPlugin: webpack.WebpackPluginInstance = {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyGitHubDesktopStaticPlugin', () => {
      fs.copySync(
        path.resolve(__dirname, 'static', 'common'),
        path.resolve(__dirname, '..', 'out', 'static'),
        { overwrite: true }
      )
    })
  },
}

const rendererConfig: webpack.Configuration = {
  mode: 'production',
  devtool: 'source-map',
  target: 'electron-renderer',
  externals: ['7zip'],
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', 'out'),
    library: {
      name: '[name]',
      type: 'commonjs2',
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'vendor'),
          path.resolve(__dirname, 'shims'),
        ],
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.renderer.json'),
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.node$/,
        loader: 'awesome-node-loader',
        options: {
          name: '[name].[hash].[ext]',
        },
      },
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        type: 'asset/resource',
        generator: {
          filename: '[path][name][ext]',
        },
      },
      {
        test: /\.cmd$/,
        type: 'asset/resource',
      },
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    aliasFields: [],
    alias: {
      'desktop-notifications/dist/notification-callback': path.resolve(__dirname, 'shims/desktop-notifications.ts'),
      'desktop-notifications': path.resolve(__dirname, 'shims/desktop-notifications.ts'),
      'desktop-trampoline': path.resolve(__dirname, 'vendor/desktop-trampoline/index.ts'),
      'windows-argv-parser': path.resolve(__dirname, 'vendor/windows-argv-parser/index.ts'),
      'process-proxy': path.resolve(__dirname, 'shims/process-proxy.ts'),
      'react/jsx-runtime': path.resolve(__dirname, '../../../node_modules/react/jsx-runtime.js'),
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'static', 'index.html'),
      chunks: ['renderer'],
    }),
    new webpack.NormalModuleReplacementPlugin(/^vscode-jsonrpc$/, resource => {
      resource.request = 'vscode-jsonrpc/lib/node/main.js'
    }),
    new webpack.NormalModuleReplacementPlugin(
      /vscode-jsonrpc[\\/]node(\.js)?$/,
      resource => {
        resource.request = 'vscode-jsonrpc/lib/node/main.js'
      }
    ),
    new webpack.DefinePlugin(
      Object.assign({}, getReplacements(), {
        __PROCESS_KIND__: JSON.stringify('ui'),
      })
    ),
    new MiniCssExtractPlugin({ filename: 'renderer.css' }),
    copyGitHubDesktopStaticPlugin,
  ],
  node: {
    __dirname: false,
    __filename: false,
  },
}

export default rendererConfig
