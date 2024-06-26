const { src, dest, series } = require('gulp');
const minify = require('gulp-uglify');

// Files to bundle
const files = ['./package.json', './.env'];

// Task to bundle JavaScript files
const bundleJS = () => {
    return src(['./dist/**/*.js', '!./dist/**/*.spec.js']).pipe(minify()).pipe(dest('./bundle'));
};

// Task to copy required files
const copyFiles = () => {
    return src(files, { base: './' }).pipe(dest('./bundle'));
};

exports.bundle = series(bundleJS, copyFiles);
