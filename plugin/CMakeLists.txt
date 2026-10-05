cmake_minimum_required(VERSION 3.22)

project(MIDItestNative VERSION 0.1.0 LANGUAGES CXX)

option(MIDITEST_BUILD_TESTS "Build MIDItest native tests" ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

include(cmake/Dependencies.cmake)

set(MIDITEST_CORE_SOURCES
    src/core/MidiMessageDecoder.cpp
    src/core/MidiMessageDecoder.h
    src/core/MidiEvent.h
    src/core/ControlAnalyzer.cpp
    src/core/ControlAnalyzer.h
    src/core/PitchAnalyzer.cpp
    src/core/PitchAnalyzer.h
    src/core/ClockAnalyzer.cpp
    src/core/ClockAnalyzer.h
    src/core/EventQueue.h
    src/core/SessionModel.cpp
    src/core/SessionModel.h
    src/core/DiagnosticEngine.cpp
    src/core/DiagnosticEngine.h)

juce_add_plugin(MIDItest
    COMPANY_NAME "Circuit Drift Labs"
    BUNDLE_ID "io.circuitdriftlabs.miditest"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE CDrL
    PLUGIN_CODE Mdt1
    FORMATS VST3
    PRODUCT_NAME "MIDItest")

juce_generate_juce_header(MIDItest)

target_sources(MIDItest PRIVATE
    src/PluginProcessor.cpp
    src/PluginProcessor.h
    src/PluginEditor.cpp
    src/PluginEditor.h
    ${MIDITEST_CORE_SOURCES})

target_include_directories(MIDItest PRIVATE src)

target_compile_definitions(MIDItest PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    MIDITEST_VERSION_STRING="0.1.0-alpha.1")

target_link_libraries(MIDItest PRIVATE
    juce::juce_audio_utils
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

clap_juce_extensions_plugin(
    TARGET MIDItest
    CLAP_ID "io.circuitdriftlabs.miditest"
    CLAP_FEATURES audio-effect utility)

if(MIDITEST_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
