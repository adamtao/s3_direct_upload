require 'active_support/all'
require 's3_direct_upload'

RSpec.configure do |config|
  config.expect_with(:rspec) { |c| c.syntax = :should }
  config.run_all_when_everything_filtered = true
  config.filter_run :focus

  config.order = 'random'
end
