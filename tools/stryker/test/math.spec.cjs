const { expect } = require('chai');
const { isPositive } = require('../src/math.cjs');

describe('isPositive', () => {
  it('true for 0 and positives', () => {
    expect(isPositive(0)).to.equal(true);
    expect(isPositive(5)).to.equal(true);
  });
  it('false for negatives', () => {
    expect(isPositive(-1)).to.equal(false);
  });
});
