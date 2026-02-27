package com.eft.mobileagent

class HomeTabFragment : LegacyMainTabFragment() {
    override val tabMode: MainTab = MainTab.HOME
    override val tabLayoutRes: Int = R.layout.fragment_home_tab
}
