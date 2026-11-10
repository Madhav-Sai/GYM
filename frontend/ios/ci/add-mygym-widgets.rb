# Adds myGym's health widgets (ios/App/OpenGymWidgets/MyGymWidgets.swift: Macros, Supplements,
# My day, Whoop metric, Week) to the existing OpenGymWidgets target, in the style of add-widgets.rb.
# The file goes into the target's own group, beside WhoopWidgets.swift. Running it again changes
# nothing.
#
#   ruby frontend/ios/ci/add-mygym-widgets.rb
require 'xcodeproj'

TARGET = 'OpenGymWidgets'
FILES = %w[MyGymWidgets.swift].freeze

dir = File.expand_path('../App', __dir__)
proj = Xcodeproj::Project.open(File.join(dir, 'App.xcodeproj'))
ext = proj.targets.find { |t| t.name == TARGET }
abort "no #{TARGET} target (run add-widgets.rb first)" unless ext
group = proj.main_group.children.find { |g| g.respond_to?(:path) && g.path == TARGET }
abort "no #{TARGET} group" unless group

added = []
FILES.each do |f|
  abort "#{TARGET}/#{f} does not exist" unless File.exist?(File.join(dir, TARGET, f))
  ref = group.files.find { |r| r.path == f } || group.new_file(f)
  next if ext.source_build_phase.files_references.include?(ref)
  ext.add_file_references([ref])
  added << f
end

if added.empty?
  puts "#{FILES.join(', ')} already in #{TARGET}"
else
  proj.save
  puts "added #{added.join(', ')} to #{TARGET}"
end
