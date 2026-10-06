cmake_minimum_required(VERSION 3.22)
project(MIDItestNative VERSION 1.0.0 LANGUAGES C CXX)

option(MIDITEST_BUILD_PLUGIN "Build Standalone and CLAP targets" ON)
option(MIDITEST_BUILD_TESTS "Build native model tests" ON)

include(CTest)
if(MIDITEST_BUILD_TESTS)
  add_subdirectory(tests)
endif()

if(NOT MIDITEST_BUILD_PLUGIN)
  return()
endif()

include(FetchContent)
FetchContent_Declare(
  JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 9.0.3
  GIT_SHALLOW TRUE
)
FetchContent_Declare(
  clap_juce_extensions
  GIT_REPOSITORY https://github.com/free-audio/clap-juce-extensions.git
  GIT_TAG 55525c9858d4b25687be7759a5e0f70eccef218e
  GIT_SUBMODULES_RECURSE TRUE
)
FetchContent_MakeAvailable(JUCE clap_juce_extensions)

juce_add_plugin(MidiTestNative
  COMPANY_NAME "Circuit Drift Labs"
  BUNDLE_ID "com.circuitdriftlabs.miditest"
  PLUGIN_MANUFACTURER_CODE CDrf
  PLUGIN_CODE MdTs
  PRODUCT_NAME "MIDItest"
  DESCRIPTION "MIDI diagnostic monitor and controller test bench"
  FORMATS Standalone
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT TRUE
  IS_MIDI_EFFECT TRUE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE
)

juce_generate_juce_header(MidiTestNative)
target_sources(MidiTestNative PRIVATE
  src/DiagnosticModel.cpp
  src/PluginProcessor.cpp
  src/PluginEditor.cpp
  src/DiagnosticModel.h
  src/PluginProcessor.h
  src/PluginEditor.h
)
target_compile_features(MidiTestNative PRIVATE cxx_std_20)
target_compile_definitions(MidiTestNative PUBLIC
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  JUCE_REPORT_APP_USAGE=0
)
target_link_libraries(MidiTestNative PRIVATE
  juce::juce_audio_utils
  juce::juce_gui_extra
  juce::juce_recommended_config_flags
  juce::juce_recommended_warning_flags
)

clap_juce_extensions_plugin(
  TARGET MidiTestNative
  CLAP_ID "com.circuitdriftlabs.miditest"
  CLAP_FEATURES note-effect utility analyzer
  CLAP_MANUAL_URL "https://djshellshoxxx.github.io/Miditest/"
  CLAP_SUPPORT_URL "https://github.com/djshellshoxxx/Miditest/issues"
  CLAP_CHECKING_LEVEL Maximal
)
