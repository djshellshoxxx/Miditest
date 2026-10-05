function(miditest_add_test target test_name)
    juce_add_console_app(${target} PRODUCT_NAME "${target}")
    target_sources(${target} PRIVATE ${ARGN})
    juce_generate_juce_header(${target})
    target_include_directories(${target} PRIVATE ../src)
    target_compile_features(${target} PRIVATE cxx_std_20)
    target_compile_definitions(${target} PRIVATE
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        MIDITEST_VERSION_STRING="0.1.0-alpha.1")
    target_link_libraries(${target} PRIVATE
        juce::juce_audio_utils
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
    add_test(NAME ${test_name} COMMAND ${target})
endfunction()

set(MIDITEST_TEST_PLUGIN_SOURCES
    ../src/PluginProcessor.cpp
    ../src/PluginEditor.cpp
    ../src/core/MidiMessageDecoder.cpp
    ../src/core/ControlAnalyzer.cpp
    ../src/core/PitchAnalyzer.cpp
    ../src/core/ClockAnalyzer.cpp
    ../src/core/SessionModel.cpp
    ../src/core/DiagnosticEngine.cpp
    ../src/core/MappingModel.cpp
    ../src/core/ReportBuilder.cpp
    ../src/ui/MainView.cpp
    ../src/ui/MonitorView.cpp
    ../src/ui/ControlsView.cpp
    ../src/ui/KeyboardView.cpp
    ../src/ui/TimingView.cpp
    ../src/ui/MappingView.cpp
    ../src/ui/ReportView.cpp)

miditest_add_test(MIDItestTests smoke
    test_smoke.cpp
    ${MIDITEST_TEST_PLUGIN_SOURCES})

miditest_add_test(MIDItestDecoderTests decoder
    test_decoder.cpp
    ../src/core/MidiMessageDecoder.cpp)

miditest_add_test(MIDItestControlTests controls
    test_controls.cpp
    ../src/core/ControlAnalyzer.cpp)

miditest_add_test(MIDItestPitchTests pitch
    test_pitch.cpp
    ../src/core/PitchAnalyzer.cpp)

miditest_add_test(MIDItestClockTests clock
    test_clock.cpp
    ../src/core/ClockAnalyzer.cpp)

miditest_add_test(MIDItestProcessorTests processor
    test_processor.cpp
    ${MIDITEST_TEST_PLUGIN_SOURCES})

miditest_add_test(MIDItestSessionTests session
    test_session.cpp
    ../src/core/SessionModel.cpp
    ../src/core/ControlAnalyzer.cpp
    ../src/core/PitchAnalyzer.cpp
    ../src/core/ClockAnalyzer.cpp)

miditest_add_test(MIDItestMappingStateTests mapping_state
    test_mapping_state.cpp
    ${MIDITEST_TEST_PLUGIN_SOURCES})

miditest_add_test(MIDItestReportTests report
    test_report.cpp
    ../src/core/ReportBuilder.cpp
    ../src/core/MidiMessageDecoder.cpp)

miditest_add_test(MIDItestUiTests ui
    test_ui.cpp
    ${MIDITEST_TEST_PLUGIN_SOURCES})
