#!/usr/bin/env node

const webpack = require('../lib/webpack.js')
const config = require('../miniwebpack.config.js')

webpack(config)